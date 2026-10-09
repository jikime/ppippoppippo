#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "cg_protocol.h"

/* No board dependencies: stale/replay behavior is also verified on the host. */
static inline bool beacon_accept(const cg_packet_t *old, const cg_packet_t *next, bool has_packet) {
    if (!has_packet) return true;
    if (!next->fresh && next->kind == 0 && old->kind != 0) return false;
    if (old->epoch != next->epoch) return true;
    if (next->revision < old->revision) return false;
    return next->revision != old->revision || cg_equal(old, next);
}
static inline bool beacon_event_changed(const cg_packet_t *a, const cg_packet_t *b) {
    return a->kind != b->kind || a->zone != b->zone || a->source != b->source;
}
static inline uint32_t beacon_repeat_ms(uint32_t kind) {
    return kind == 0 ? 0 : kind >= 4 ? 30000 : 60000;
}
typedef struct { uint8_t r, g, b; } BeaconColor;
static inline BeaconColor beacon_color(uint32_t kind) {
    if (kind == 0) return (BeaconColor){0,255,0};
    if (kind < 4) return (BeaconColor){255,255,0};
    return (BeaconColor){255,0,0};
}
/* At most two short flashes per two-second pattern; no high-rate strobe. */
static inline uint8_t beacon_level(uint32_t kind, unsigned led, uint32_t ms) {
    uint32_t t = ms % 2000;
    switch(kind) {
        case 0: { uint32_t b=ms%4000; return 12+(b<2000?b:4000-b)*52/2000; }
        case 1: return t<350 ? 150 : 0;
        case 2: { uint32_t b=ms%2400; return 18+(b<1200?b:2400-b)*130/1200; }
        case 3: return led==(ms/220)%7 ? 180 : 10;
        case 4: return ms%1200<600 ? 180 : 0;
        case 5: return t<220 || (t>=600 && t<820) ? 180 : 0;
        case 6: return t<150 || (t>=350 && t<650) ? 180 : 0;
        case 7: return ms%1000<500 ? 220 : 0;
        case 8: return (led<3)==(ms%1400<700) ? 180 : 0;
        default: return 0;
    }
}
