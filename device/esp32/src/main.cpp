#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#include <driver/i2s.h>
#include <esp_heap_caps.h>
#include <es8311.h>
#include <atomic>
extern "C" {
#include "cg_protocol.h"
#include "beacon_logic.h"
}
#include "voice_index.h"

// Waveshare ESP32-S3-AUDIO-Board v1.1 schematic / official factory example.
static constexpr int LED_PIN=38, LED_COUNT=7, I2C_SDA=11, I2C_SCL=10;
static constexpr uint8_t EXPANDER=0x20; // EXIO8=amplifier; EXIO9/10/11=user buttons
static constexpr uint32_t RATE=24000, LINK_TIMEOUT=8000;
static Adafruit_NeoPixel ring(LED_COUNT,LED_PIN,NEO_RGB+NEO_KHZ800);
static es8311_handle_t codec=nullptr;
static cg_packet_t current={1,1,0,0,0,0,0,0};
static bool hasPacket=false, stale=true, muted=false, ioReady=false;
static uint32_t lastRx=0, lastAnnouncement=0;
static std::atomic<bool> audioReady{false};
static std::atomic<uint32_t> voiceCount{0};
static int volume=55;
static std::atomic<uint32_t> audioGeneration{0};
static std::atomic<bool> playing{false};
static std::atomic<int> lastClip{-1};
struct AudioJob { uint32_t generation; uint8_t clips[5], count; };
static QueueHandle_t audioQueue;
extern const uint8_t voiceStart[] asm("_binary_generated_voice_pcm_start");
extern const uint8_t voiceEnd[] asm("_binary_generated_voice_pcm_end");

static bool writeRegister(uint8_t reg,uint8_t value) {
    Wire.beginTransmission(EXPANDER); Wire.write(reg); Wire.write(value);
    return Wire.endTransmission()==0;
}
static int readRegister(uint8_t reg) {
    Wire.beginTransmission(EXPANDER); Wire.write(reg);
    if (Wire.endTransmission(false)!=0 || Wire.requestFrom(EXPANDER,(uint8_t)1)!=1) return -1;
    return Wire.read();
}
static bool amplifier(bool enabled) {
    int output=readRegister(3);
    return output>=0 && writeRegister(3,enabled?(output|1):(output&~1));
}
static void stopAudio() {
    ++audioGeneration;
    if (audioQueue) xQueueReset(audioQueue);
}
static void schedule(const uint8_t *clips,uint8_t count) {
    if (!audioReady || muted || count==0 || count>5) return;
    AudioJob job={}; job.generation=++audioGeneration; job.count=count;
    memcpy(job.clips,clips,count);
    xQueueOverwrite(audioQueue,&job); lastAnnouncement=millis();
}
static void announce(bool force=false) {
    if (!hasPacket || (!force && muted)) return;
    uint8_t clips[5]; uint8_t n=0;
    clips[n++]=current.source==1?13:14;
    if (current.kind) clips[n++]=9+current.zone;
    clips[n++]=current.kind;
    if (current.count>1) clips[n++]=17;
    if (stale) clips[n++]=15;
    schedule(clips,n);
}
static void audioTask(void *) {
    // PSRAM buffers keep voice memory separate from USB / LED timing and DMA memory.
    int16_t *stereo=(int16_t *)heap_caps_malloc(480*2*sizeof(int16_t),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if (!stereo) stereo=(int16_t *)malloc(480*2*sizeof(int16_t));
    if (!stereo) { audioReady=false; vTaskDelete(nullptr); return; }
    AudioJob job;
    for (;;) {
        if (xQueueReceive(audioQueue,&job,portMAX_DELAY)!=pdTRUE) continue;
        playing=true;
        for (unsigned c=0;c<job.count && job.generation==audioGeneration;c++) {
            unsigned id=job.clips[c];
            if (id>=sizeof(VOICE_CLIPS)/sizeof(VOICE_CLIPS[0])) break;
            VoiceClip clip=VOICE_CLIPS[id];
            if ((clip.offset|clip.length)&1 || clip.offset+clip.length>(uint32_t)(voiceEnd-voiceStart)) break;
            lastClip=id;
            const int16_t *pcm=(const int16_t *)(voiceStart+clip.offset);
            for (uint32_t offset=0;offset<clip.length/2 && job.generation==audioGeneration;) {
                unsigned samples=min((uint32_t)480,clip.length/2-offset);
                for (unsigned i=0;i<samples;i++) stereo[i*2]=stereo[i*2+1]=pcm[offset+i];
                size_t written=0;
                if (i2s_write(I2S_NUM_0,stereo,samples*4,&written,pdMS_TO_TICKS(100))!=ESP_OK || written!=samples*4) {
                    audioReady=false; break;
                }
                offset+=samples;
            }
            if (!audioReady) break;
        }
        // Let the final DMA samples finish; interrupted jobs clear the tail immediately.
        if (job.generation==audioGeneration && audioReady) {
            memset(stereo,0,480*2*sizeof(int16_t));
            for (unsigned i=0;i<6 && job.generation==audioGeneration;i++) {
                size_t written=0; i2s_write(I2S_NUM_0,stereo,480*4,&written,pdMS_TO_TICKS(100));
            }
        }
        i2s_zero_dma_buffer(I2S_NUM_0);
        if (job.generation==audioGeneration && audioReady) ++voiceCount;
        playing=false;
    }
}
static bool initAudio() {
    i2s_config_t cfg={};
    cfg.mode=(i2s_mode_t)(I2S_MODE_MASTER|I2S_MODE_TX);
    cfg.sample_rate=RATE; cfg.bits_per_sample=I2S_BITS_PER_SAMPLE_16BIT;
    cfg.channel_format=I2S_CHANNEL_FMT_RIGHT_LEFT;
    cfg.communication_format=I2S_COMM_FORMAT_STAND_I2S;
    cfg.intr_alloc_flags=ESP_INTR_FLAG_LEVEL1;
    cfg.dma_buf_count=8; cfg.dma_buf_len=240; cfg.tx_desc_auto_clear=true;
    cfg.mclk_multiple=I2S_MCLK_MULTIPLE_256; cfg.bits_per_chan=I2S_BITS_PER_CHAN_16BIT;
    i2s_pin_config_t pins={}; pins.mck_io_num=12; pins.bck_io_num=13;
    pins.ws_io_num=14; pins.data_out_num=16; pins.data_in_num=I2S_PIN_NO_CHANGE;
    if (i2s_driver_install(I2S_NUM_0,&cfg,0,nullptr)!=ESP_OK || i2s_set_pin(I2S_NUM_0,&pins)!=ESP_OK) return false;
    codec=es8311_create(I2C_NUM_0,ES8311_ADDRRES_0);
    es8311_clock_config_t clk={}; clk.mclk_from_mclk_pin=true;
    clk.mclk_frequency=RATE*256; clk.sample_frequency=RATE;
    if (!codec || es8311_init(codec,&clk,ES8311_RESOLUTION_16,ES8311_RESOLUTION_16)!=ESP_OK) return false;
    if (es8311_voice_volume_set(codec,volume,nullptr)!=ESP_OK || es8311_microphone_config(codec,false)!=ESP_OK) return false;
    i2s_zero_dma_buffer(I2S_NUM_0);
    return amplifier(true);
}
static void setVolume(int next) {
    next=constrain(next,10,75);
    if (audioReady && es8311_voice_volume_set(codec,next,nullptr)==ESP_OK) volume=next;
}
static void status() {
    Serial.printf("JG_STATUS 1,%lu,%lu,%lu,%d,%d,%d,%d,%d,%lu,%d,%d,%lu\r\n",
      (unsigned long)current.epoch,(unsigned long)current.revision,(unsigned long)current.kind,
      !stale,muted,volume,(int)audioReady.load(),(int)playing.load(),(unsigned long)voiceCount.load(),lastClip.load(),LED_COUNT,(unsigned long)ESP.getPsramSize());
}
static void command(char *line) {
    if (!strcmp(line,"jg_status")) { status(); return; }
    if (!strcmp(line,"jg_mute")) { muted=true; stopAudio(); status(); return; }
    if (!strcmp(line,"jg_replay")) { muted=false; announce(true); status(); return; }
    if (!strncmp(line,"jg_volume ",10)) {
        char *end=nullptr; long value=strtol(line+10,&end,10);
        if (end!=line+10 && !*end && value>=10 && value<=75) setVolume(value);
        status(); return;
    }
    if (strncmp(line,"cg_alert ",9)) { Serial.println("JG_ERR command"); return; }
    cg_packet_t next;
    if (!cg_parse(line+9,&next) || !beacon_accept(&current,&next,hasPacket)) { Serial.println("JG_ERR packet"); return; }
    bool changed=!hasPacket || beacon_event_changed(&current,&next);
    bool wasStale=stale;
    current=next; hasPacket=true; lastRx=millis(); stale=!next.fresh;
    if (changed) {
        muted=false; stopAudio();
        // Never speak "no warning" on a stale channel.
        if (!stale || current.kind) announce();
    } else if (!stale && wasStale && current.kind) announce();
    else if (stale && !wasStale) { uint8_t clip=15; schedule(&clip,1); }
    // ACK means LED state accepted. Audio health is reported separately in JG_STATUS.
    Serial.printf("CG_ACK 1,%lu,%lu\r\n",(unsigned long)current.epoch,(unsigned long)current.revision);
    status();
}
static void serialTick() {
    static char line[128]; static unsigned used=0; static bool overflow=false;
    unsigned budget=256;
    while (budget-- && Serial.available()) {
        int b=Serial.read();
        if (b=='\r'||b=='\n') {
            if (used && !overflow) { line[used]=0; command(line); }
            used=0; overflow=false;
        } else if (b>=32 && b<=126 && used<sizeof(line)-1) line[used++]=(char)b;
        else overflow=true;
    }
}
static void ledTick(uint32_t now) {
    BeaconColor color=beacon_color(current.kind);
    for (unsigned led=0;led<LED_COUNT;led++) {
        BeaconColor c=color; uint8_t level=beacon_level(current.kind,led,now);
        if (current.kind && current.zone && led/2==current.zone-1) level=max(level,(uint8_t)28);
        if (stale && (current.kind==0 ? led==(now/250)%7 : led==6 && now%3000<1000)) {
            c={0,207,255}; level=120;
        } else if (stale && current.kind==0) level=0;
        ring.setPixelColor(led,(uint16_t)c.r*level/255,(uint16_t)c.g*level/255,(uint16_t)c.b*level/255);
    }
    ring.show();
}
static void buttonTick(uint32_t now) {
    static uint8_t previous=0, candidate=0; static uint32_t changedAt=0, downAt=0;
    static bool held=false;
    int raw=readRegister(1); if (raw<0) return;
    uint8_t keys=((~raw)>>1)&7;
    if (keys!=candidate) { candidate=keys; changedAt=now; }
    if (now-changedAt<40) return;
    uint8_t pressed=keys&~previous, released=previous&~keys;
    if (pressed&1) setVolume(volume+5);
    if (pressed&4) setVolume(volume-5);
    if (pressed&2) { downAt=now; held=false; }
    if ((keys&2) && !held && now-downAt>=1000) { muted=false; announce(true); held=true; }
    if ((released&2) && !held) { muted=!muted; if (muted) stopAudio(); else announce(true); }
    previous=keys;
}
void setup() {
    Serial.begin(115200); Serial.setTxTimeoutMs(5);
    ring.begin(); ring.clear(); ring.show();
    Wire.begin(I2C_SDA,I2C_SCL); Wire.setClock(400000); Wire.setTimeOut(30);
    // Preserve every expander function except amplifier enable. Other pins stay inputs.
    int config=readRegister(7);
    ioReady=config>=0 && writeRegister(7,(config|0x0e)&~1) && amplifier(false);
    audioQueue=xQueueCreate(1,sizeof(AudioJob));
    audioReady=ioReady && audioQueue && initAudio();
    if (audioReady && xTaskCreatePinnedToCore(audioTask,"voice",4096,nullptr,2,nullptr,0)!=pdPASS) audioReady=false;
    Serial.printf("JEONJO_BEACON_READY v1 audio=%d leds=7 flash=%lu psram=%lu\r\n",(int)audioReady.load(),(unsigned long)ESP.getFlashChipSize(),(unsigned long)ESP.getPsramSize());
    if (audioReady) { uint8_t clip=16; schedule(&clip,1); }
}
void loop() {
    uint32_t now=millis(); serialTick();
    if (hasPacket && !stale && now-lastRx>LINK_TIMEOUT) {
        stale=true; uint8_t clip=15; schedule(&clip,1);
    }
    uint32_t repeat=beacon_repeat_ms(current.kind);
    if (hasPacket && !stale && !muted && !playing && repeat && now-lastAnnouncement>=repeat) announce();
    static uint32_t lastFrame=0, lastButtons=0;
    if (now-lastFrame>=25) { ledTick(now); lastFrame=now; }
    if (ioReady && now-lastButtons>=20) { buttonTick(now); lastButtons=now; }
    delay(2);
}
