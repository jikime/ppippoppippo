#include "cg_protocol.h"
#include <stddef.h>

bool cg_parse(const char *input, cg_packet_t *packet)
{
    uint32_t fields[8] = {0};
    const uint32_t maxima[8] = {1, 2147483647, 2147483647, 8, 3, 1, 32, 1};
    if (!input || !packet) return false;
    for (unsigned i = 0; i < 8; i++) {
        unsigned digits = 0;
        while (*input >= '0' && *input <= '9') {
            uint32_t digit = (uint32_t)(*input++ - '0');
            if (++digits > 10 || fields[i] > (UINT32_MAX - digit) / 10) return false;
            fields[i] = fields[i] * 10 + digit;
        }
        if (!digits || fields[i] > maxima[i]) return false;
        if (i < 7) { if (*input++ != ',') return false; }
        else if (*input != '\0') return false;
    }
    if (fields[0] != 1 || fields[1] == 0 || ((fields[3] == 0) != (fields[6] == 0))) return false;
    *packet = (cg_packet_t){fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6], fields[7]};
    return true;
}

bool cg_equal(const cg_packet_t *a, const cg_packet_t *b)
{
    return a->version == b->version && a->epoch == b->epoch && a->revision == b->revision &&
           a->kind == b->kind && a->zone == b->zone && a->source == b->source &&
           a->count == b->count && a->fresh == b->fresh;
}
