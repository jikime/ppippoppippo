#include <stdio.h>
#include <string.h>
#include "tal_api.h"
#include "tal_cli.h"
#include "tkl_output.h"
#include "board_com_api.h"
#include "lvgl.h"
#include "lv_vendor.h"
#include "cg_protocol.h"
#include "cg_catalog.h"

LV_FONT_DECLARE(cg_font_20);
LV_FONT_DECLARE(cg_font_28);
static lv_obj_t *screen, *stripe, *source_label, *connection_label, *severity_label;
static lv_obj_t *title_label, *zone_label, *instruction_label, *count_label, *ack_button, *ack_label;
static cg_packet_t received, displayed;
static bool has_packet, stale = true, acknowledged;
static uint32_t last_rx;
static THREAD_HANDLE app_thread;

static lv_obj_t *label_at(int x, int y, int w, const lv_font_t *font)
{
    lv_obj_t *label = lv_label_create(screen);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_width(label, w);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, lv_color_hex(CG_COLOR_TEXT), 0);
    lv_obj_set_style_text_line_space(label, 6, 0);
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
    return label;
}

static uint32_t accent_color(void)
{
    if (!has_packet || (displayed.kind == 0 && stale)) return CG_COLOR_WAITING;
    unsigned severity = cg_alerts[displayed.kind].severity;
    return severity == 2 ? CG_COLOR_CRITICAL : severity == 1 ? CG_COLOR_WARNING : CG_COLOR_NORMAL;
}

static void render(void)
{
    const cg_alert_text_t *alert = &cg_alerts[displayed.kind];
    uint32_t accent = accent_color();
    lv_obj_set_style_bg_color(screen, lv_color_hex(CG_COLOR_BACKGROUND), 0);
    lv_obj_set_style_bg_color(stripe, lv_color_hex(accent), 0);
    lv_obj_set_style_text_color(severity_label, lv_color_hex(accent), 0);
    lv_obj_set_style_text_color(title_label, lv_color_hex(accent), 0);
    lv_label_set_text(source_label, has_packet ? cg_sources[displayed.source] : "USB / 115200");
    lv_label_set_text(connection_label, !has_packet ? CG_WAITING : stale ? CG_STALE : CG_LIVE);
    lv_obj_set_style_text_color(connection_label, lv_color_hex(stale ? CG_COLOR_WAITING : CG_COLOR_NORMAL), 0);
    lv_label_set_text(severity_label, alert->severity == 2 ? CG_CRITICAL : alert->severity == 1 ? CG_WARNING : CG_NORMAL);
    lv_label_set_text(title_label, has_packet ? alert->title : CG_WAITING);
    lv_label_set_text(zone_label, cg_zones[displayed.zone]);
    lv_label_set_text(instruction_label, alert->instruction);
    lv_label_set_text_fmt(count_label, "%s %lu%s", CG_COUNT, (unsigned long)displayed.count, CG_UNIT);
    lv_label_set_text(ack_label, acknowledged ? CG_ACKED : CG_ACK);
    lv_obj_set_style_bg_color(ack_button, lv_color_hex(accent), 0);
}

static void acknowledge_touch(lv_event_t *event)
{
    (void)event;
    acknowledged = true;
    render(); /* Acknowledging never clears an active warning. */
}

static void check_link(lv_timer_t *timer)
{
    (void)timer;
    if (has_packet && !stale && lv_tick_elaps(last_rx) >= 8000) {
        stale = true;
        render();
    }
}

static void alert_command(int argc, char **argv)
{
    cg_packet_t next;
    if (argc != 2 || !cg_parse(argv[1], &next)) { tal_cli_echo("CG_ERR invalid\r\n"); return; }
    lv_vendor_disp_lock();
    if (has_packet && next.epoch == received.epoch &&
        (next.revision < received.revision || (next.revision == received.revision && !cg_equal(&next, &received)))) {
        lv_vendor_disp_unlock(); tal_cli_echo("CG_ERR outdated\r\n"); return;
    }
    /* A disconnected/restarting publisher must not turn a previous alarm into an all-clear. */
    if (next.fresh || !has_packet) {
        if (displayed.kind != next.kind || displayed.zone != next.zone || displayed.source != next.source) acknowledged = false;
        displayed = next;
    }
    received = next; has_packet = true; stale = !next.fresh; last_rx = lv_tick_get();
    render();
    lv_vendor_disp_unlock();
    char response[80];
    snprintf(response, sizeof(response), "CG_ACK 1,%lu,%lu\r\n", (unsigned long)next.epoch, (unsigned long)next.revision);
    tal_cli_echo(response);
}

static void status_command(int argc, char **argv)
{
    (void)argc; (void)argv;
    char response[180];
    lv_vendor_disp_lock();
    snprintf(response, sizeof(response), "CG_STATUS v1 kind=%lu stale=%u ack=%u brand=%s bg=%06lx accent=%06lx panel=320x480 font=ko\r\n",
             (unsigned long)displayed.kind, stale ? 1 : 0, acknowledged ? 1 : 0, CG_BRAND,
             (unsigned long)CG_COLOR_BACKGROUND, (unsigned long)accent_color());
    lv_vendor_disp_unlock(); tal_cli_echo(response);
}

static void user_main(void)
{
    tal_log_init(TAL_LOG_LEVEL_WARN, 2048, (TAL_LOG_OUTPUT_CB)tkl_log_output);
    board_register_hardware();
    lv_vendor_init(DISPLAY_NAME);
    screen = lv_screen_active();
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    stripe = lv_obj_create(screen);
    lv_obj_remove_style_all(stripe);
    lv_obj_set_size(stripe, 7, 480);
    lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
    lv_label_set_text(label_at(22, 17, 276, &cg_font_20), CG_BRAND);
    source_label = label_at(22, 53, 276, &cg_font_20);
    connection_label = label_at(22, 84, 276, &cg_font_20);
    severity_label = label_at(22, 135, 276, &cg_font_20);
    title_label = label_at(22, 170, 276, &cg_font_28);
    zone_label = label_at(22, 245, 276, &cg_font_20);
    instruction_label = label_at(22, 283, 276, &cg_font_20);
    count_label = label_at(22, 380, 276, &cg_font_20);
    ack_button = lv_button_create(screen);
    lv_obj_set_pos(ack_button, 22, 416);
    lv_obj_set_size(ack_button, 276, 46);
    lv_obj_set_style_radius(ack_button, 10, 0);
    ack_label = lv_label_create(ack_button);
    lv_obj_set_style_text_font(ack_label, &cg_font_20, 0);
    lv_obj_set_style_text_color(ack_label, lv_color_hex(CG_COLOR_BACKGROUND), 0);
    lv_obj_center(ack_label);
    lv_obj_add_event_cb(ack_button, acknowledge_touch, LV_EVENT_CLICKED, NULL);
    render();
    lv_timer_create(check_link, 500, NULL);
    lv_vendor_start(5, 8192);
    tal_cli_init();
    static const cli_cmd_t commands[] = {
        {"cg_alert", "JEONJO alert protocol v1", alert_command},
        {"cg_status", "JEONJO display status", status_command},
    };
    tal_cli_cmd_register(commands, sizeof(commands) / sizeof(commands[0]));
    tal_cli_echo("CG_READY 1\r\n");
}

static void app_main(void *argument)
{
    (void)argument;
    user_main();
    tal_thread_delete(app_thread);
    app_thread = NULL;
}

void tuya_app_main(void)
{
    THREAD_CFG_T config = {0};
    config.stackDepth = 8192;
    config.priority = THREAD_PRIO_1;
    config.thrdname = "crowdguard";
    tal_thread_create_and_start(&app_thread, NULL, NULL, app_main, NULL, &config);
}
