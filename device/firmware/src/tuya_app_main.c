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
#include "cg_pictograms.h"

LV_FONT_DECLARE(cg_font_20);
LV_FONT_DECLARE(cg_font_20_bold);
LV_FONT_DECLARE(cg_font_28);
static lv_obj_t *screen, *stripe, *source_label, *connection_label, *severity_label;
static lv_obj_t *title_label, *zone_label, *instruction_label, *count_label, *ack_button, *ack_label;
static lv_obj_t *pictogram;
static lv_span_t *instruction_before, *instruction_emphasis, *instruction_after;
static int current_icon = -1;
static uint32_t current_icon_color;
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

static unsigned icon_kind(void)
{
    return !has_packet || (displayed.kind == 0 && stale) ? CG_ICON_WAITING : displayed.kind;
}

static void render_pictogram(uint32_t accent)
{
    unsigned kind = icon_kind();
    /* Keep objects and static point arrays alive between heartbeat updates. */
    if (current_icon == (int)kind && current_icon_color == accent) return;
    lv_obj_clean(pictogram);
    const cg_icon_t *icon = &cg_icons[kind];
    for (unsigned i = 0; i < icon->line_count; ++i) {
        lv_obj_t *line = lv_line_create(pictogram);
        lv_obj_remove_style_all(line);
        lv_obj_set_pos(line, 0, 0);
        lv_line_set_points(line, icon->lines[i].points, icon->lines[i].count);
        lv_obj_set_style_line_width(line, 4, 0);
        lv_obj_set_style_line_rounded(line, true, 0);
        lv_obj_set_style_line_color(line, lv_color_hex(accent), 0);
    }
    for (unsigned i = 0; i < icon->circle_count; ++i) {
        const cg_icon_circle_t *circle = &icon->circles[i];
        lv_obj_t *dot = lv_obj_create(pictogram);
        lv_obj_remove_style_all(dot);
        lv_obj_remove_flag(dot, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_pos(dot, circle->x, circle->y);
        lv_obj_set_size(dot, circle->diameter, circle->diameter);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(dot, 4, 0);
        lv_obj_set_style_border_color(dot, lv_color_hex(accent), 0);
    }
    current_icon = (int)kind;
    current_icon_color = accent;
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
    lv_span_set_text_static(instruction_before, alert->before);
    lv_span_set_text_static(instruction_emphasis, alert->emphasis);
    lv_span_set_text_static(instruction_after, alert->after);
    lv_spangroup_refr_mode(instruction_label);
    lv_label_set_text_fmt(count_label, "%s %lu%s", CG_COUNT, (unsigned long)displayed.count, CG_UNIT);
    lv_label_set_text(ack_label, acknowledged ? CG_ACKED : CG_ACK);
    lv_obj_set_style_bg_color(ack_button, lv_color_hex(accent), 0);
    render_pictogram(accent);
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
    char response[240];
    lv_vendor_disp_lock();
    lv_obj_update_layout(screen);
    snprintf(response, sizeof(response), "CG_STATUS v1 kind=%lu stale=%u ack=%u brand=%s bg=%06lx accent=%06lx panel=%ldx%ld rotation=90 font=ko emphasis=800 icon=%s body_h=%ld\r\n",
             (unsigned long)displayed.kind, stale ? 1 : 0, acknowledged ? 1 : 0, CG_BRAND,
             (unsigned long)CG_COLOR_BACKGROUND, (unsigned long)accent_color(),
             (long)lv_display_get_horizontal_resolution(NULL), (long)lv_display_get_vertical_resolution(NULL),
             cg_icons[icon_kind()].id, (long)lv_obj_get_height(instruction_label));
    lv_vendor_disp_unlock(); tal_cli_echo(response);
}

static void user_main(void)
{
    tal_log_init(TAL_LOG_LEVEL_WARN, 2048, (TAL_LOG_OUTPUT_CB)tkl_log_output);
    board_register_hardware();
    lv_vendor_init(DISPLAY_NAME);
    /* Tuya's flush port rotates the pixels; LVGL also rotates touch coordinates. */
    lv_display_set_rotation(lv_display_get_default(), LV_DISPLAY_ROTATION_90);
    screen = lv_screen_active();
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    stripe = lv_obj_create(screen);
    lv_obj_remove_style_all(stripe);
    lv_obj_set_size(stripe, 7, 320);
    lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
    lv_label_set_text(label_at(22, 16, 114, &cg_font_20_bold), CG_BRAND);
    source_label = label_at(150, 16, 232, &cg_font_20);
    pictogram = lv_obj_create(screen);
    lv_obj_remove_style_all(pictogram);
    lv_obj_remove_flag(pictogram, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(pictogram, 402, 12);
    lv_obj_set_size(pictogram, CG_ICON_SIZE, CG_ICON_SIZE);
    connection_label = label_at(22, 49, 366, &cg_font_20);
    severity_label = label_at(22, 89, 436, &cg_font_20_bold);
    title_label = label_at(22, 117, 436, &cg_font_28);
    zone_label = label_at(22, 158, 436, &cg_font_20_bold);
    instruction_label = lv_spangroup_create(screen);
    lv_obj_set_pos(instruction_label, 22, 194);
    lv_obj_set_width(instruction_label, 436);
    lv_obj_set_style_text_font(instruction_label, &cg_font_20, 0);
    lv_obj_set_style_text_color(instruction_label, lv_color_hex(CG_COLOR_TEXT), 0);
    lv_obj_set_style_text_line_space(instruction_label, 6, 0);
    lv_spangroup_set_mode(instruction_label, LV_SPAN_MODE_BREAK);
    instruction_before = lv_spangroup_new_span(instruction_label);
    instruction_emphasis = lv_spangroup_new_span(instruction_label);
    instruction_after = lv_spangroup_new_span(instruction_label);
    lv_style_set_text_font(&instruction_emphasis->style, &cg_font_20_bold);
    count_label = label_at(22, 278, 190, &cg_font_20);
    ack_button = lv_button_create(screen);
    lv_obj_set_pos(ack_button, 232, 269);
    lv_obj_set_size(ack_button, 226, 40);
    lv_obj_set_style_radius(ack_button, 10, 0);
    ack_label = lv_label_create(ack_button);
    lv_obj_set_style_text_font(ack_label, &cg_font_20_bold, 0);
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
