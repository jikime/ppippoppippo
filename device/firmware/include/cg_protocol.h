#ifndef CG_PROTOCOL_H
#define CG_PROTOCOL_H
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint32_t version, epoch, revision, kind, zone, source, count, fresh;
} cg_packet_t;

/* Numeric catalog IDs only: UART input is never interpreted as display text. */
bool cg_parse(const char *input, cg_packet_t *packet);
bool cg_equal(const cg_packet_t *a, const cg_packet_t *b);
#endif
