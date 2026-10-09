#include <assert.h>
#include <stdio.h>
#include "beacon_logic.h"

int main(void) {
    cg_packet_t fire={1,123,5,7,2,1,1,1}, next=fire;
    assert(beacon_accept(&fire,&next,true));
    next.revision=4; assert(!beacon_accept(&fire,&next,true));
    next=fire; next.kind=5; assert(!beacon_accept(&fire,&next,true));
    next.revision++; assert(beacon_accept(&fire,&next,true));
    next=(cg_packet_t){1,456,1,0,0,0,0,0};
    assert(!beacon_accept(&fire,&next,true)); // New server, not yet connected, must not clear a fire.
    next.fresh=1; assert(beacon_accept(&fire,&next,true));
    next=fire; next.count=2; assert(!beacon_event_changed(&fire,&next));
    next.zone=1; assert(beacon_event_changed(&fire,&next));
    next=fire; next.source=0; assert(beacon_event_changed(&fire,&next));
    assert(beacon_repeat_ms(7)==30000 && beacon_repeat_ms(2)==60000 && beacon_repeat_ms(0)==0);
    for (uint32_t kind=0;kind<9;kind++) {
        BeaconColor c=beacon_color(kind);
        assert(c.b==0 && c.r==(kind?255:0) && c.g==(kind<4?255:0));
        bool everOn=false,everDim=false;
        for (uint32_t t=0;t<5000;t+=25) for (unsigned led=0;led<7;led++) {
            uint8_t level=beacon_level(kind,led,t);
            assert(level<=220); everOn|=level>40; everDim|=level<40;
        }
        assert(everOn && everDim);
    }
    puts("LED patterns, stale alarm retention, replay protection: passed");
}
