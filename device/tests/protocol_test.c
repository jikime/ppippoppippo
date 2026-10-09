#include <assert.h>
#include "cg_protocol.h"
int main(void) {
    cg_packet_t packet;
    assert(cg_parse("1,123,4,7,2,1,1,1", &packet));
    assert(packet.kind == 7 && packet.zone == 2 && packet.fresh == 1);
    assert(cg_parse("1,2147483647,2147483647,0,0,0,0,0", &packet));
    const char *invalid[] = {"", "1,0,1,7,0,1,1,1", "1,1,1,7,0,1,0,1", "1,1,1,0,0,1,1,1",
        "1,1,1,9,0,1,1,1", "1,1,1,7,4,1,1,1", "1,1,1,7,0,2,1,1", "1,1,1,7,0,1,33,1",
        "1,1,1,7,0,1,1,2", "1,1,1,7,0,1,1,1,", "1,1,1,7,0,1,1,1\rsys_reboot",
        "1,1,-1,7,0,1,1,1", "1,1,4294967297,7,0,1,1,1", "1,1,1,7,0,1,1", "1,1,1,7,0,1,,1"};
    for (unsigned i=0; i<sizeof(invalid)/sizeof(invalid[0]); i++) assert(!cg_parse(invalid[i], &packet));
    return 0;
}
