/**
 * Deterministic character briefs for a realistic human asset pipeline.
 * These records describe requested assets; they are not generated 3D models.
 * No evacuation, health, personality or behavior parameters are inferred here.
 */
export const ASSET_SCHEMA_VERSION = "1.1.0";

const option = (id, label, prompt) => Object.freeze({ id, label, prompt });

export const PRESETS = Object.freeze([
  { id: "hackathon", name: "해커톤", description: "캐주얼한 참가자와 다양한 스타일의 개발 행사 군중" },
  { id: "concert", name: "콘서트", description: "차분한 관객부터 개성 있는 공연 관람객까지" },
  { id: "transit", name: "대중교통", description: "다양한 연령과 일상복의 역·터미널 이용객" },
  { id: "office", name: "오피스", description: "정장과 비즈니스 캐주얼이 어우러진 업무 공간" },
  { id: "rescue", name: "재난 대응", description: "성인 대응 인력의 실용적인 작업복과 보호복" },
  { id: "baseball", name: "미국 야구장", description: "야구 팬·운영 직원·매점 직원이 섞인 관중석과 동선" },
  { id: "aws", name: "AWS 행사장", description: "차분한 색상의 일상복을 입은 행사 참가자와 운영 직원" },
  { id: "school", name: "학교", description: "10–17세 학생과 성인 교사·교직원이 함께 있는 학교" },
  { id: "inspire", name: "인스파이어 아레나", description: "실내 공연장의 관객·안내 직원·무대 운영 인력" },
  { id: "construction", name: "건설현장", description: "안전모·고가시성 의류·안전화를 착용한 현장 인력" },
  { id: "airport", name: "공항", description: "여행객·항공사 직원·지상 조업 직원이 섞인 공항" },
].map(Object.freeze));

const SKIN_TONES = Object.freeze([
  option("porcelain", "아주 밝은 피부", "very light skin"),
  option("fair", "밝은 피부", "light skin"),
  option("beige", "연한 베이지 피부", "light beige skin"),
  option("warm-medium", "따뜻한 중간톤 피부", "warm medium skin"),
  option("olive-medium", "올리브 중간톤 피부", "medium olive skin"),
  option("tan", "구릿빛 피부", "tan skin"),
  option("deep-brown", "짙은 갈색 피부", "deep brown skin"),
  option("very-deep", "아주 짙은 갈색 피부", "very deep brown skin"),
]);

const GENDER_PRESENTATIONS = Object.freeze([
  option("feminine", "여성적인 표현", "feminine presentation"),
  option("masculine", "남성적인 표현", "masculine presentation"),
  option("androgynous", "중성적인 표현", "androgynous presentation"),
]);

const BODY_BUILDS = Object.freeze([
  option("slender", "슬림한 체형", "slender build"),
  option("average", "보통 체형", "average build"),
  option("broad", "넓은 골격", "broad build"),
  option("full", "통통한 체형", "fuller build"),
  option("athletic", "근육이 있는 체형", "athletic build"),
]);

const HAIRSTYLES = Object.freeze([
  option("short-crop", "짧고 단정한 머리", "short cropped hair"),
  option("textured-short", "짧은 텍스처 머리", "short textured hair"),
  option("tousled", "자연스러운 더벅머리", "tousled medium hair"),
  option("bob", "단발머리", "chin-length bob hair"),
  option("waves", "어깨 길이 웨이브", "shoulder-length wavy hair"),
  option("curls", "짧고 촘촘한 곱슬머리", "short tight curls"),
  option("braids", "뒤로 묶은 땋은 머리", "braids tied behind head"),
  option("ponytail", "낮게 묶은 머리", "low ponytail"),
  option("shaved", "매우 짧게 민 머리", "closely shaved hair"),
  option("bald", "민머리", "bald head"),
]);

const HAIR_COLORS = Object.freeze([
  option("black", "검정", "black"),
  option("dark-brown", "짙은 갈색", "dark brown"),
  option("brown", "갈색", "brown"),
  option("auburn", "적갈색", "auburn"),
  option("blond", "금발", "blond"),
  option("salt-pepper", "검정·회색 혼합", "salt-and-pepper"),
  option("silver", "은회색", "silver"),
]);

const ACCESSORIES = Object.freeze([
  option("none", "액세서리 없음", "no accessories"),
  option("round-glasses", "둥근 안경", "round eyeglasses"),
  option("rectangular-glasses", "사각 안경", "rectangular eyeglasses"),
  option("thin-glasses", "얇은 테 안경", "thin-frame eyeglasses"),
  option("studs", "작은 귀걸이", "small stud earrings"),
  option("watch", "손목시계", "simple wristwatch"),
  option("headband", "심플한 헤어밴드", "plain fabric headband"),
]);

const PALETTES = Object.freeze([
  option("slate", "슬레이트·차콜", "slate and charcoal"),
  option("navy", "네이비·크림", "navy and cream"),
  option("earth", "올리브·샌드", "olive and sand"),
  option("warm", "테라코타·아이보리", "terracotta and ivory"),
  option("forest", "포레스트·베이지", "forest green and beige"),
  option("ocean", "코발트·회색", "cobalt and gray"),
  option("berry", "버건디·블랙", "burgundy and black"),
  option("lavender", "라벤더·인디고", "lavender and indigo"),
  option("teal", "틸·코럴", "teal and coral"),
  option("sunset", "앰버·바이올렛", "amber and violet"),
]);

const OUTFITS = Object.freeze({
  hackathon: [
    option("tee-jeans", "티셔츠·스트레이트 진", "plain T-shirt, straight jeans, sneakers"),
    option("shirt-chinos", "셔츠·치노 팬츠", "casual shirt, chinos, sneakers"),
    option("hoodie", "집업 후디·면바지", "zip hoodie, cotton trousers, sneakers"),
    option("cardigan", "가디건·와이드 팬츠", "cardigan, wide-leg trousers, loafers"),
    option("overshirt", "오버셔츠·카고 팬츠", "overshirt, cargo trousers, trainers"),
    option("knit", "니트·데님", "crewneck knit, jeans, ankle boots"),
    option("utility", "유틸리티 재킷·조거", "utility jacket, joggers, trainers"),
    option("layered", "스트라이프 상의·치노", "striped long-sleeve top, chinos, sneakers"),
  ],
  concert: [
    option("concert-tee", "프린트 없는 티셔츠·진", "plain T-shirt, jeans, sneakers"),
    option("denim", "데님 재킷·면바지", "denim jacket, cotton trousers, trainers"),
    option("bomber", "봄버 재킷·와이드 팬츠", "bomber jacket, wide-leg pants, sneakers"),
    option("patterned", "패턴 셔츠·카고 팬츠", "patterned shirt, cargo pants, boots"),
    option("monochrome", "단색 레이어드 룩", "layered tunic, slim trousers, ankle boots"),
    option("sport", "스포티한 트랙 재킷", "track jacket, loose trousers, trainers"),
    option("oversized", "오버핏 스웨트셔츠", "oversized sweatshirt, jeans, high-top shoes"),
    option("patchwork", "패치워크 재킷·팬츠", "patchwork jacket, plain trousers, boots"),
  ],
  transit: [
    option("commuter", "캐주얼 재킷·면바지", "casual jacket, cotton trousers, walking shoes"),
    option("transit-shirt", "셔츠·슬랙스", "buttoned shirt, slacks, comfortable shoes"),
    option("raincoat", "짧은 레인코트·진", "short raincoat, jeans, walking shoes"),
    option("sweater", "니트·편한 바지", "knit sweater, relaxed pants, sneakers"),
    option("polo", "폴로 셔츠·치노", "polo shirt, chinos, loafers"),
    option("linen", "린넨 셔츠·와이드 팬츠", "linen shirt, wide-leg trousers, flat shoes"),
    option("quilted", "퀼팅 재킷·진", "quilted jacket, jeans, ankle boots"),
    option("windbreaker", "바람막이·조거", "windbreaker, joggers, trainers"),
  ],
  office: [
    option("business-casual", "셔츠·테일러드 팬츠", "business shirt, tailored trousers, dress shoes"),
    option("office-knit", "니트·슬랙스", "fine knit top, slacks, loafers"),
    option("blazer", "블레이저·치노", "unstructured blazer, chinos, loafers"),
    option("suit", "정장 세트", "two-piece suit, plain shirt, dress shoes"),
    option("office-cardigan", "가디건·테일러드 팬츠", "cardigan, collared top, tailored pants, flats"),
    option("turtleneck", "터틀넥·테일러드 팬츠", "turtleneck, tailored trousers, ankle boots"),
    option("office-vest", "베스트·셔츠·슬랙스", "knit vest, shirt, slacks, loafers"),
    option("relaxed-blazer", "여유로운 재킷·팬츠", "relaxed blazer, wide-leg pants, dress shoes"),
  ],
  rescue: [
    option("response-workwear", "대응 인력 작업복", "work jacket, work trousers, sturdy boots"),
    option("response-vest", "고가시성 조끼·작업복", "high-visibility vest, long workwear, boots"),
    option("response-coveralls", "일체형 작업복", "utility coveralls, sturdy boots"),
    option("response-shell", "방수 재킷·작업 바지", "waterproof shell, utility pants, boots"),
    option("response-layered", "작업 셔츠·카고 팬츠", "long-sleeve work shirt, cargo pants, boots"),
    option("response-fleece", "플리스·작업 바지", "fleece jacket, utility trousers, boots"),
    option("response-reflective", "반사띠 재킷·팬츠", "reflective work jacket, work pants, boots"),
    option("response-padded", "방한 작업 재킷", "padded work jacket, work trousers, boots"),
  ],
});

// Roles describe venue participation only. Physical traits remain independently
// sampled; clothing and school age ranges are matched to the selected role.
const ROLES = Object.freeze({
  hackathon: [option("attendee", "참가자", "hackathon attendee"), option("mentor", "멘토", "event mentor"), option("staff", "운영 직원", "event staff")],
  concert: [option("audience", "관객", "concert audience member"), option("usher", "안내 직원", "venue usher"), option("crew", "공연 운영 인력", "concert crew member")],
  transit: [option("passenger", "이용객", "transit passenger"), option("commuter", "통근 이용객", "commuter"), option("traveler", "여행 이용객", "traveler")],
  office: [option("worker", "근무자", "office worker"), option("visitor", "방문객", "office visitor"), option("reception", "안내 직원", "reception staff")],
  rescue: [option("responder", "대응 인력", "disaster response worker"), option("coordinator", "현장 지원 인력", "response support worker"), option("volunteer", "자원봉사자", "response volunteer")],
  baseball: [option("fan", "야구 팬", "baseball spectator"), option("staff", "운영 직원", "stadium operations staff"), option("concessions", "매점 직원", "stadium concessions staff")],
  aws: [option("attendee", "행사 참가자", "technology event attendee"), option("staff", "운영 직원", "technology event staff")],
  school: [option("pupil", "학생", "school pupil"), option("teacher", "교사", "school teacher"), option("school-staff", "교직원", "school support staff")],
  inspire: [option("audience", "실내 공연 관객", "indoor arena spectator"), option("usher", "안내 직원", "indoor arena usher"), option("crew", "공연 운영 인력", "indoor arena production crew")],
  construction: [option("worker", "현장 작업자", "construction worker"), option("supervisor", "현장 관리자", "site supervisor"), option("inspector", "현장 점검 인력", "site inspector")],
  airport: [option("traveler", "여행객", "airport traveler"), option("airline-staff", "항공사 직원", "airline customer service staff"), option("ground-staff", "지상 조업 직원", "airport ground staff")],
});

const CONTEXT_OUTFITS = Object.freeze({
  "baseball:fan": [
    option("fan-jersey", "무지 야구 저지·진·캡", "plain baseball jersey, jeans, cap, sneakers"),
    option("fan-tee", "티셔츠·치노·캡", "plain T-shirt, chinos, cap, sneakers"),
    option("fan-hoodie", "후디·진", "zip hoodie, jeans, trainers"),
    option("fan-windbreaker", "바람막이·카고 팬츠", "windbreaker, cargo pants, trainers"),
    option("fan-raglan", "래글런 셔츠·진", "raglan shirt, jeans, sneakers"),
    option("fan-varsity", "바시티 재킷·치노", "plain varsity jacket, chinos, sneakers"),
  ],
  "baseball:staff": [
    option("stadium-polo", "운영 폴로·슬랙스", "plain staff polo, slacks, walking shoes"),
    option("stadium-jacket", "운영 재킷·치노", "plain staff jacket, chinos, trainers"),
    option("stadium-vest", "운영 조끼·셔츠·슬랙스", "staff vest, shirt, slacks, flat shoes"),
  ],
  "baseball:concessions": [
    option("concessions-apron", "티셔츠·앞치마·캡", "T-shirt, waist apron, cap, trousers, work shoes"),
    option("concessions-polo", "폴로·앞치마·캡", "polo, apron, cap, work pants, closed work shoes"),
    option("concessions-shirt", "매점 셔츠·앞치마", "work shirt, apron, trousers, closed work shoes"),
  ],
  "aws:attendee": [
    option("aws-tee", "무지 티셔츠·진", "plain T-shirt, jeans, sneakers"),
    option("aws-hoodie", "후디·면바지", "plain hoodie, cotton trousers, trainers"),
    option("aws-check", "체크 셔츠·치노", "check shirt, chinos, sneakers"),
    option("aws-stripe", "스트라이프 상의·진", "striped top, jeans, sneakers"),
    option("aws-light-jacket", "가벼운 재킷·팬츠", "light jacket, plain tee, trousers, trainers"),
    option("aws-overshirt", "오버셔츠·슬랙스", "overshirt, relaxed slacks, sneakers"),
  ],
  "aws:staff": [
    option("aws-staff-tee", "무지 운영 티셔츠·진", "plain staff T-shirt, jeans, trainers"),
    option("aws-staff-polo", "운영 폴로·치노", "plain staff polo, chinos, sneakers"),
    option("aws-staff-hoodie", "운영 후디·면바지", "plain zip hoodie, cotton trousers, trainers"),
    option("aws-staff-jacket", "가벼운 운영 재킷", "light staff jacket, trousers, sneakers"),
  ],
  "school:pupil": [
    option("school-sweatshirt", "스웨트셔츠·면바지", "modest sweatshirt, cotton trousers, sneakers"),
    option("school-polo", "폴로 셔츠·면바지", "modest polo shirt, cotton pants, trainers"),
    option("school-hoodie", "후디·진", "plain hoodie, jeans, sneakers"),
    option("school-cardigan", "가디건·셔츠·바지", "cardigan, plain shirt, trousers, flat shoes"),
    option("school-tee", "넉넉한 티셔츠·바지", "loose T-shirt, full-length pants, sneakers"),
    option("school-track", "학교 체육복", "long-sleeve tracksuit, full-length pants, trainers"),
  ],
  "school:teacher": OUTFITS.office,
  "school:school-staff": OUTFITS.transit,
  "inspire:audience": OUTFITS.concert,
  "inspire:usher": [
    option("arena-usher-polo", "안내 폴로·슬랙스", "plain staff polo, slacks, comfortable shoes"),
    option("arena-usher-jacket", "안내 재킷·바지", "plain staff jacket, trousers, flat shoes"),
    option("arena-usher-vest", "안내 조끼·셔츠", "staff vest, shirt, trousers, flat shoes"),
  ],
  "inspire:crew": [
    option("arena-crew-tee", "운영 티셔츠·카고 팬츠", "plain crew T-shirt, cargo pants, work shoes"),
    option("arena-crew-jacket", "운영 재킷·작업 바지", "utility jacket, work trousers, sturdy shoes"),
    option("arena-crew-hoodie", "운영 후디·작업 바지", "plain hoodie, work trousers, sturdy shoes"),
  ],
  "construction:worker": [
    option("site-vest", "안전모·고가시성 조끼·안전화", "hard hat, hi-vis vest, long workwear, safety boots"),
    option("site-jacket", "안전모·고가시성 재킷·안전화", "hard hat, hi-vis jacket, work pants, safety boots"),
    option("site-coveralls", "안전모·고가시성 작업복·안전화", "hard hat, hi-vis coveralls, safety boots"),
    option("site-shell", "안전모·고가시성 방수 작업복", "hard hat, hi-vis rain jacket, work pants, safety boots"),
  ],
  "construction:supervisor": [
    option("site-supervisor", "안전모·고가시성 조끼·작업복", "hard hat, hi-vis vest, work shirt, pants, safety boots"),
    option("site-supervisor-shell", "안전모·고가시성 현장 재킷", "hard hat, hi-vis shell jacket, work pants, safety boots"),
    option("site-supervisor-coat", "안전모·고가시성 코트", "hard hat, hi-vis work coat, trousers, safety boots"),
  ],
  "construction:inspector": [
    option("site-inspector", "안전모·고가시성 조끼·안전화", "hard hat, hi-vis vest, long workwear, safety boots"),
    option("site-inspector-jacket", "안전모·고가시성 점검 재킷", "hard hat, hi-vis work jacket, trousers, safety boots"),
    option("site-inspector-rain", "안전모·고가시성 레인 재킷", "hard hat, hi-vis rain jacket, work pants, safety boots"),
  ],
  "airport:traveler": OUTFITS.transit,
  "airport:airline-staff": [
    option("airline-blazer", "항공사 재킷·셔츠·슬랙스", "plain airline blazer, shirt, slacks, dress shoes"),
    option("airline-vest", "항공사 베스트·셔츠·슬랙스", "plain airline vest, shirt, slacks, dress shoes"),
    option("airline-knit", "항공사 니트·셔츠·슬랙스", "plain uniform knit, collared shirt, slacks, flat shoes"),
  ],
  "airport:ground-staff": [
    option("ground-vest", "고가시성 조끼·작업복·안전화", "hi-vis vest, long workwear, safety shoes"),
    option("ground-jacket", "고가시성 작업 재킷·안전화", "hi-vis work jacket, work trousers, safety shoes"),
    option("ground-coveralls", "고가시성 작업복·안전화", "hi-vis coveralls, safety shoes"),
  ],
});

const MUTED_PALETTES = Object.freeze([
  option("black-gray", "블랙·그레이", "black and gray"),
  option("navy-white", "네이비·화이트", "navy and white"),
  option("beige-black", "베이지·블랙", "beige and black"),
  option("olive-gray", "올리브·그레이", "olive and gray"),
  option("white-charcoal", "화이트·차콜", "white and charcoal"),
  option("sand-navy", "샌드·네이비", "sand and navy"),
]);

const WORK_PALETTES = Object.freeze([
  option("safety-yellow", "안전 노랑·차콜", "hi-vis yellow and charcoal"),
  option("safety-orange", "안전 주황·네이비", "hi-vis orange and navy"),
  option("safety-lime", "안전 라임·그레이", "hi-vis lime and gray"),
]);

const PROP_CATALOG = Object.freeze({
  laptop: ["노트북", "laptop"], bottle: ["물병", "water bottle"], backpack: ["백팩", "backpack"],
  chair: ["의자", "chair"], desk: ["책상", "desk"], phone: ["휴대전화", "phone"],
  stadiumSeat: ["야구장 좌석", "stadium seat"], cup: ["음료 컵", "drink cup"], concessionCounter: ["매점 카운터", "concession counter"],
  book: ["교재", "school book"], arenaSeat: ["실내 공연장 좌석", "arena seat"], lightStick: ["응원봉", "light stick"],
  toolCase: ["공구함", "tool case"], trafficCone: ["안전 콘", "traffic cone"], machinery: ["건설 장비", "construction machinery"],
  suitcase: ["여행 가방", "suitcase"], luggageCart: ["수하물 카트", "luggage cart"], boardingDesk: ["공항 안내 데스크", "airport service desk"],
  barrier: ["안전 차단대", "safety barrier"], equipmentBag: ["대응 장비 가방", "response equipment bag"],
});

const VENUE_PROP_IDS = Object.freeze({
  hackathon: ["laptop", "bottle", "backpack", "chair", "desk"],
  concert: ["arenaSeat", "lightStick", "phone"],
  transit: ["backpack", "suitcase", "chair", "phone"],
  office: ["laptop", "desk", "chair", "bottle"],
  rescue: ["equipmentBag", "barrier", "trafficCone"],
  baseball: ["stadiumSeat", "cup", "concessionCounter"],
  aws: ["laptop", "bottle", "backpack", "chair", "desk", "phone"],
  school: ["desk", "chair", "book", "backpack"],
  inspire: ["arenaSeat", "lightStick", "phone", "barrier"],
  construction: ["toolCase", "trafficCone", "machinery", "barrier"],
  airport: ["suitcase", "luggageCart", "boardingDesk", "chair"],
});

const ACTIVITY_CATALOG = Object.freeze({
  "seated-typing": "앉아서 타이핑", "seated-viewing": "앉아서 관람", "seated-learning": "앉아서 학습",
  "seated-working": "앉아서 업무", "standing-queue": "서서 대기", walking: "걷기", talking: "대화",
  "standing-phone": "서서 휴대전화 사용", cheering: "응원", greeting: "이용객 안내", serving: "매점 응대",
  teaching: "수업 진행", "crew-check": "운영 상태 점검", "site-check": "현장 점검", "response-support": "현장 지원",
});

const VENUE_ACTIVITY_IDS = Object.freeze({
  hackathon: ["seated-typing", "talking", "standing-queue", "walking"],
  concert: ["seated-viewing", "cheering", "standing-queue", "walking"],
  transit: ["standing-queue", "walking", "standing-phone"],
  office: ["seated-working", "talking", "walking"],
  rescue: ["response-support", "standing-queue", "walking"],
  baseball: ["seated-viewing", "cheering", "standing-queue", "walking"],
  aws: ["seated-typing", "talking", "standing-phone", "walking"],
  school: ["seated-learning", "talking", "standing-queue", "walking"],
  inspire: ["seated-viewing", "cheering", "standing-queue", "walking"],
  construction: ["site-check", "talking", "walking"],
  airport: ["standing-queue", "walking", "standing-phone"],
});

const ROLE_ACTIVITY_IDS = Object.freeze({
  "baseball:staff": ["greeting", "standing-queue", "walking"],
  "baseball:concessions": ["serving", "standing-queue", "walking"],
  "aws:staff": ["greeting", "talking", "walking"],
  "school:teacher": ["teaching", "seated-working", "walking"],
  "school:school-staff": ["greeting", "seated-working", "walking"],
  "inspire:usher": ["greeting", "standing-queue", "walking"],
  "inspire:crew": ["crew-check", "talking", "walking"],
  "airport:airline-staff": ["greeting", "seated-working", "walking"],
  "airport:ground-staff": ["crew-check", "talking", "walking"],
});

const AGE_BANDS = Object.freeze([
  { id: "18-29", min: 18, max: 29, label: "18–29세" },
  { id: "30-44", min: 30, max: 44, label: "30–44세" },
  { id: "45-59", min: 45, max: 59, label: "45–59세" },
  { id: "60-79", min: 60, max: 79, label: "60–79세" },
]);

const PUPIL_AGE_BANDS = Object.freeze([
  { id: "10-13", min: 10, max: 13, label: "10–13세" },
  { id: "14-17", min: 14, max: 17, label: "14–17세" },
]);

const WORK_ACCESSORIES = Object.freeze([
  option("safety-glasses", "보안경", "clear safety glasses"),
  option("safety-glasses-earmuffs", "보안경·귀 보호구", "safety glasses and ear defenders"),
  option("safety-overglasses", "도수 안경 위 보안경", "protective overglasses"),
]);

function limitedVariety(options, variety) {
  const minimum = Math.min(2, options.length);
  return options.slice(0, minimum + Math.floor(variety * (options.length - minimum) / 100));
}

function roleOutfits(preset, role) {
  return CONTEXT_OUTFITS[`${preset}:${role.id}`]
    ?? (preset === "concert" ? CONTEXT_OUTFITS[`inspire:${role.id}`] : undefined)
    ?? OUTFITS[preset];
}

function rolePalettes(preset, role) {
  if (preset === "construction" || (preset === "airport" && role.id === "ground-staff")) return WORK_PALETTES;
  if (preset === "aws" || (preset === "airport" && role.id === "airline-staff")) return MUTED_PALETTES;
  if (preset === "inspire" && role.id === "crew") return MUTED_PALETTES.slice(0, 2);
  return PALETTES;
}

function recommendedProps(preset) {
  return VENUE_PROP_IDS[preset].map((id) => ({
    id, label: PROP_CATALOG[id][0], prompt: PROP_CATALOG[id][1],
    status: "planned", relationship: "separate-scene-prop", includeInCharacterMesh: false,
  }));
}

function expectedActivities(preset, role) {
  const ids = ROLE_ACTIVITY_IDS[`${preset}:${role.id}`] ?? VENUE_ACTIVITY_IDS[preset];
  return ids.map((id) => ({
    id, label: ACTIVITY_CATALOG[id], status: "planned", animationStatus: "not-generated",
    note: "장면 구성용 예정 동작이며 애니메이션은 생성되지 않았습니다.",
  }));
}

const NEUTRAL_POSE = Object.freeze({
  id: "neutral-a-pose", label: "중립 A 포즈",
  prompt: "neutral A-pose, arms 30 degrees out, feet apart, empty open hands",
});

function hash32(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(key) {
  let state = hash32(key);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Separate shuffled decks balance each trait without coupling two traits.
// Per-cycle keys preserve the prefix when the requested count grows.
function balancedPick(options, key, index) {
  const cycle = Math.floor(index / options.length);
  const random = rng(`${key}:cycle:${cycle}`);
  const deck = options.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { ...deck[index % deck.length] };
}

function numericOption(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

/**
 * Build an English text-to-3D request, always no more than 600 characters.
 * A-pose is a requested pose; generated topology/rigging require later validation.
 */
export function buildPrompt(character) {
  const t = character.traits;
  const hair = t.hairstyle.id === "bald"
    ? t.hairstyle.prompt
    : `${t.hairColor.prompt} ${t.hairstyle.prompt}`;
  const core = [
    "Photorealistic full-body 3D human",
    `${t.age.value} years old`, t.genderPresentation.prompt,
    t.role?.prompt ?? "person",
    t.skinTone.prompt, t.bodyBuild.prompt, hair,
    `fully clothed: ${t.clothing.prompt}`,
    `${t.palette.prompt} clothing`, t.accessory.prompt,
    NEUTRAL_POSE.prompt,
    "age-appropriate anatomy, detailed face, PBR skin and fabric",
    "single isolated character, no base, no scene, no text, no logo",
  ].join("; ") + ".";
  // Curated data stays within the limit. This fallback also supports callers
  // supplying their own verbose trait descriptors without splitting words.
  if (core.length <= 600) return core;
  const shortened = core
    .replace("Photorealistic full-body 3D human", "Realistic full-body human")
    .replace("age-appropriate anatomy, detailed face, PBR skin and fabric; ", "age-appropriate anatomy, PBR materials; ");
  if (shortened.length <= 600) return shortened;
  const requiredEnd = "; neutral A-pose, fully clothed, empty hands, one isolated human, no scene, no text.";
  const prefix = shortened.slice(0, 600 - requiredEnd.length).replace(/\s+\S*$/, "");
  return prefix + requiredEnd;
}

/**
 * @param {{seed?: string|number, count?: number, preset?: string, variation?: number}} options
 * @returns {Array<object>} Character briefs, not actual 3D assets.
 * count: 0–10,000, default 24. variation: 0–100, default 65.
 * variation changes only the available clothing/palette range.
 * School pupils are 10–17; educators, staff, and all other presets are adults.
 * Props and activity metadata are scene plans, not generated meshes/animations.
 * Same inputs reproduce the same output. Increasing count preserves the prefix.
 * Unsupported preset IDs throw so the caller can surface the selection problem.
 */
export function generateCharacters({ seed = "crowd-2026", count = 24, preset = "hackathon", variation = 65 } = {}) {
  const presetInfo = PRESETS.find((item) => item.id === preset);
  if (!presetInfo) throw new RangeError(`Unknown preset: ${String(preset)}`);
  const total = Math.floor(numericOption(count, 24, 0, 10000));
  const variety = Math.round(numericOption(variation, 65, 0, 100));
  const seedText = String(seed);
  const identityKey = `${seedText}:${preset}`;
  const batchId = hash32(`${identityKey}:variation:${variety}`).toString(36).padStart(7, "0");
  const pick = (options, field, index) => balancedPick(options, `${identityKey}:${field}`, index);

  return Array.from({ length: total }, (_, index) => {
    const role = pick(ROLES[preset], "role", index);
    const isPupil = preset === "school" && role.id === "pupil";
    const ageBand = pick(isPupil ? PUPIL_AGE_BANDS : AGE_BANDS, "age-band", index);
    const ageValue = ageBand.min + Math.floor(rng(`${identityKey}:age:${index}`)() * (ageBand.max - ageBand.min + 1));
    const outfitPool = limitedVariety(roleOutfits(preset, role), variety);
    const palettePool = limitedVariety(rolePalettes(preset, role), variety);
    const accessoryPool = preset === "construction" || (preset === "airport" && role.id === "ground-staff")
      ? WORK_ACCESSORIES : ACCESSORIES;
    const character = {
      id: `${preset}-${batchId}-${String(index + 1).padStart(5, "0")}`,
      name: `${presetInfo.name} ${String(index + 1).padStart(3, "0")}`,
      preset: presetInfo.id,
      presetName: presetInfo.name,
      assetSchemaVersion: ASSET_SCHEMA_VERSION,
      intendedUse: "Realistic human crowd asset brief for web 3D / Three.js disaster-simulation scenes",
      generationStatus: "brief-only",
      seed: seedText,
      variation: variety,
      traits: {
        role,
        age: { id: ageBand.id, label: `${ageValue}세`, value: ageValue, range: [ageBand.min, ageBand.max] },
        skinTone: pick(SKIN_TONES, "skin-tone", index),
        genderPresentation: pick(GENDER_PRESENTATIONS, "gender-presentation", index),
        bodyBuild: pick(BODY_BUILDS, "body-build", index),
        hairstyle: pick(HAIRSTYLES, "hairstyle", index),
        hairColor: pick(HAIR_COLORS, "hair-color", index),
        clothing: pick(outfitPool, "clothing", index),
        accessory: pick(accessoryPool, "accessory", index),
        palette: pick(palettePool, "palette", index),
        mobility: {
          id: "unassigned", label: "시뮬레이션에서 별도 설정", value: null,
          note: "외모에서 이동 속도, 장애 여부 또는 대피 행동을 추정하지 않습니다.",
        },
        pose: { ...NEUTRAL_POSE },
      },
      recommendedProps: recommendedProps(preset),
      expectedActivities: expectedActivities(preset, role),
      assetRequirements: {
        targetFormat: "glb",
        renderer: "Three.js",
        materials: "PBR",
        pose: "neutral A-pose",
        realPersonReference: false,
        riggingStatus: "not-generated",
        validationRequired: ["mesh", "materials", "scale", "rig", "animation", "LOD"],
      },
    };
    character.prompt = buildPrompt(character);
    return character;
  });
}
