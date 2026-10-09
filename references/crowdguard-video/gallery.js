(() => {
  "use strict";
  const D = window.CROWDGUARD_REFERENCE;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const stamp = (t, precise = false) => `${String(Math.floor(t / 60)).padStart(2,"0")}:${(precise ? (t % 60).toFixed(3) : String(Math.floor(t % 60))).padStart(precise ? 6 : 2,"0")}`;
  const videoMap = new Map(D.videos.map(v => [v.id, v]));
  const shotMap = new Map(D.shots.map(s => [s.id, s]));
  const player = $("player");
  const lightbox = $("lightbox");
  let activeVideo, frameGroup, frames = [], frameIndex = 0, loop = null, modalFrame;
  let shotFilter = "전체", assetFilter = "전체";
  const priority = p => `<span class="badge ${p.toLowerCase()}">${esc(p)}</span>`;
  const refs = ids => `<div class="asset-refs">장면 참고 ${(ids || []).map(id => `<button type="button" data-shot="${esc(id)}">${esc(id)}</button>`).join("")}</div>`;
  const list = (id, items) => { $(id).innerHTML = items.map(x => `<li>${esc(x)}</li>`).join(""); };

  $("stats").innerHTML = [
    [D.stats.videos,"개 영상",`${stamp(D.stats.duration)} · 원본 보관`],
    [D.stats.keyframes,"개 핵심 장면","원본 해상도 PNG"],
    [D.stats.saved_frames,"장 캡처","1초 간격 + 연속 동작 + 핵심 장면"],
    [D.stats.sequences,"개 동작 구간","차량·카메라·레이어·조명"],
    [D.stats.assets,"종 에셋 명세",`${D.stats.animations}종 애니메이션과 연결`]
  ].map(([n,label,note]) => `<div class="stat"><strong>${n}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>`).join("");

  const covers = ["K01", "K06", "K14", "K18"];
  $("directions").innerHTML = D.videos.map((v,i) => `<article class="direction">
    <img src="${esc(shotMap.get(covers[i]).image)}" alt="${esc(v.name)}" loading="lazy">
    <div class="direction-content"><p class="eyebrow">${v.id} / ${esc(v.short_name)}</p><h3>${esc(v.name)}</h3><p>${esc(v.role)}</p><p>${esc(v.apply)}</p><button type="button" data-watch="${v.id}" data-time="0">영상 살펴보기 ↗</button></div></article>`).join("");

  function renderShotFilters() {
    $("shot-filters").innerHTML = ["전체", "UI", "공간", "애니메이션", "경로", "조명"].map(tag => `<button type="button" data-shot-filter="${tag}" aria-pressed="${tag === shotFilter}">${tag}</button>`).join("");
  }
  function renderShots() {
    renderShotFilters();
    $("shot-grid").innerHTML = D.shots.filter(s => shotFilter === "전체" || s.tags.includes(shotFilter)).map(s => `<article class="shot-card">
      <button class="shot-image" type="button" data-shot="${s.id}" aria-label="${esc(s.title)} 확대"><img src="${esc(s.image)}" alt="${esc(s.title)}" loading="lazy"><span class="shot-stamp">${s.id} · ${s.video} / ${stamp(s.time)}</span></button>
      <div class="shot-copy"><h3>${esc(s.title)}</h3><p>${esc(s.note)}</p><div class="shot-bottom"><div class="tags">${s.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div><button class="text-button" type="button" data-watch="${s.video}" data-time="${s.time}">영상 보기 ↗</button></div></div></article>`).join("");
  }

  function renderMotions() {
    $("motion-grid").innerHTML = D.animation_requirements.map(m => `<article class="motion-card"><span class="motion-id">${m.id}</span><div><h3>${esc(m.name)}</h3><div class="badge-row">${priority(m.priority)}<span class="badge">${esc(m.basis)}</span></div><p>${esc(m.proposal)}</p><p class="acceptance">완료 기준 · ${esc(m.acceptance)}</p>${m.sequence ? `<button class="text-button" type="button" data-sequence="${esc(m.sequence)}">연속 프레임 비교 ↗</button>` : refs(m.refs)}</div></article>`).join("");
  }

  function renderAssets() {
    $("asset-filters").innerHTML = ["전체","P0","P1","P2"].map(p => `<button type="button" data-asset-filter="${p}" aria-pressed="${p === assetFilter}">${p}</button>`).join("");
    const query = $("asset-search").value.trim().toLocaleLowerCase();
    const assets = D.assets.filter(a => (assetFilter === "전체" || a.priority === assetFilter) && JSON.stringify(a).toLocaleLowerCase().includes(query));
    $("asset-empty").hidden = !!assets.length;
    $("asset-grid").innerHTML = assets.map(a => {
      const shot = shotMap.get(a.refs[0]);
      return `<article class="asset-card"><button class="asset-image" type="button" data-shot="${shot.id}" aria-label="${esc(a.name)} 참고 장면 확대"><img src="${esc(shot.image)}" alt="${esc(a.name)}의 형태·표현 참고" loading="lazy"><span class="tag">${esc(a.reference_type)}</span></button>
      <div class="asset-copy"><div class="badge-row">${priority(a.priority)}<span class="motion-id">${a.id}</span></div><h3>${esc(a.name)}</h3><p>${esc(a.visual)}</p><div class="tags">${a.states.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div><details><summary>형상·상태·완료 기준</summary><p><strong>역할</strong> · ${esc(a.use)}</p><p><strong>제작 제안</strong> · ${esc(a.proposal)}</p><p><strong>기준점</strong> · ${esc(a.pivot)}</p><p class="acceptance">${esc(a.acceptance)}</p></details>${refs(a.refs)}</div></article>`;
    }).join("");
  }

  function stopLoop() {
    loop = null;
    $("play-range").classList.remove("active");
    $("play-range").textContent = "선택 구간 반복";
    $("play-range").setAttribute("aria-pressed", "false");
  }
  function setFrame(index) {
    frameIndex = Math.max(0, Math.min(frames.length - 1, index));
    const f = frames[frameIndex];
    $("frame-range").value = frameIndex;
    $("frame-preview").src = f.image;
    $("frame-preview").alt = `${activeVideo.id} ${stamp(f.time, true)} 프레임 ${f.source_frame}`;
    $("frame-info").textContent = `${stamp(f.time,true)} · #${f.source_frame} · ${frameIndex + 1}/${frames.length}`;
    $("frame-file").href = f.image;
    $("frame-prev").disabled = frameIndex === 0;
    $("frame-next").disabled = frameIndex === frames.length - 1;
  }
  function chooseGroup(name, time) {
    stopLoop();
    frameGroup = D.sequences.find(s => s.name === name && s.video === activeVideo.id) || null;
    $("sequence-select").value = frameGroup ? frameGroup.name : "overview";
    frames = frameGroup ? frameGroup.frames : activeVideo.frames;
    $("frame-range").max = frames.length - 1;
    const nearest = time == null ? 0 : frames.reduce((best, f, i) => Math.abs(f.time - time) < Math.abs(frames[best].time - time) ? i : best, 0);
    setFrame(nearest);
    $("sequence-note").textContent = frameGroup ? frameGroup.observation : activeVideo.observed;
    $("sequence-apply").textContent = frameGroup ? `적용 · ${frameGroup.apply} / ${frameGroup.requested_fps === "source" ? "원본 전체 프레임" : `${frameGroup.actual_fps} fps 추출`}` : `적용 · ${activeVideo.apply}`;
    $("sheet-file").href = frameGroup ? frameGroup.contact_sheet : activeVideo.contact_sheets[0];
  }
  function seek(time) {
    const apply = () => { player.currentTime = Math.min(Math.max(time, 0), activeVideo.duration - .001); };
    if (player.readyState >= 1) apply();
    else player.onloadedmetadata = apply;
  }
  function setVideo(id, time = 0, group = "overview") {
    const v = videoMap.get(id);
    if (!v) return;
    stopLoop();
    player.pause();
    if (activeVideo?.id !== id) {
      activeVideo = v;
      $("video-select").value = id;
      player.onloadedmetadata = null;
      player.src = v.preview;
      player.poster = D.shots.find(s => s.video === id).image;
      player.load();
      player.playbackRate = Number($("speed").value);
      $("video-meta").textContent = `${v.id} · ${v.width} × ${v.height} · ${v.fps_fraction.split("/")[0]} fps · ${stamp(v.duration,true)} · ${v.frame_count.toLocaleString()} 원본 프레임`;
      $("video-links").innerHTML = `<a href="${esc(v.source)}" target="_blank" rel="noopener">원본 파일 ↗</a>${v.contact_sheets.map((s,i) => `<a href="${esc(s)}" target="_blank" rel="noopener">전체 장면표 ${i+1} ↗</a>`).join("")}`;
      $("sequence-select").innerHTML = `<option value="overview">전체 · 1초 간격 (${v.frames.length}장)</option>` + D.sequences.filter(s => s.video === id).map(s => `<option value="${esc(s.name)}">${esc(s.title)} · ${stamp(s.start)}–${stamp(s.end)} (${s.frames.length}장)</option>`).join("");
      $("segments").innerHTML = (v.segments || []).map(s => `<button type="button" data-watch="${id}" data-time="${s.start}" title="${esc(s.note)}">${stamp(s.start)} ${esc(s.title)}</button>`).join("");
    }
    chooseGroup(group, time);
    seek(time);
  }
  function watch(id, time, group = "overview") {
    if (lightbox.open) lightbox.close();
    setVideo(id, time, group);
    $("viewer").scrollIntoView({block:"start"});
  }
  function showImage(frame) {
    modalFrame = frame;
    $("lightbox-image").src = frame.image;
    $("lightbox-image").alt = frame.title;
    $("lightbox-meta").textContent = `${frame.id ? `${frame.id} · ` : ""}${frame.video} / ${stamp(frame.time,true)} / FRAME ${frame.source_frame}`;
    $("lightbox-title").textContent = frame.title;
    $("lightbox-note").textContent = frame.note;
    $("lightbox-file").href = frame.image;
    lightbox.showModal();
  }

  $("video-select").innerHTML = D.videos.map(v => `<option value="${v.id}">${v.id} · ${esc(v.name)}</option>`).join("");
  $("video-select").addEventListener("change", e => setVideo(e.target.value));
  $("sequence-select").addEventListener("change", e => {
    chooseGroup(e.target.value);
    player.pause();
    seek(frames[0].time);
  });
  $("frame-range").addEventListener("input", e => setFrame(Number(e.target.value)));
  $("frame-prev").addEventListener("click", () => setFrame(frameIndex - 1));
  $("frame-next").addEventListener("click", () => setFrame(frameIndex + 1));
  $("frame-seek").addEventListener("click", () => { player.pause(); stopLoop(); seek(frames[frameIndex].time); });
  $("speed").addEventListener("change", e => { player.playbackRate = Number(e.target.value); });
  $("play-range").addEventListener("click", async () => {
    if (loop) { stopLoop(); player.pause(); return; }
    loop = frameGroup ? {start: frameGroup.start, end: frameGroup.end} : {start: 0, end: activeVideo.duration};
    $("play-range").classList.add("active");
    $("play-range").textContent = "반복 재생 멈춤";
    $("play-range").setAttribute("aria-pressed", "true");
    seek(loop.start);
    try { await player.play(); } catch { stopLoop(); }
  });
  player.addEventListener("timeupdate", () => {
    $("player-time").textContent = stamp(player.currentTime,true);
    if (loop && player.currentTime >= loop.end) player.currentTime = loop.start;
  });
  player.addEventListener("ended", () => {
    if (loop) { player.currentTime = loop.start; player.play().catch(stopLoop); }
  });
  $("frame-zoom").addEventListener("click", () => showImage({...frames[frameIndex], video:activeVideo.id, title:frameGroup ? frameGroup.title : activeVideo.name, note:$("sequence-note").textContent}));
  $("lightbox-close").addEventListener("click", () => lightbox.close());
  $("lightbox-watch").addEventListener("click", () => watch(modalFrame.video, modalFrame.time));
  lightbox.addEventListener("click", e => { if (e.target === lightbox) { const r = lightbox.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) lightbox.close(); } });
  $("asset-search").addEventListener("input", renderAssets);
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-shot],[data-watch],[data-sequence],[data-shot-filter],[data-asset-filter]");
    if (!el) return;
    e.preventDefault();
    if (el.dataset.shot) showImage(shotMap.get(el.dataset.shot));
    else if (el.dataset.watch) watch(el.dataset.watch, Number(el.dataset.time || 0));
    else if (el.dataset.sequence) {
      const s = D.sequences.find(s => s.name === el.dataset.sequence);
      watch(s.video,s.start,s.name);
    } else if (el.dataset.shotFilter) { shotFilter = el.dataset.shotFilter; renderShots(); }
    else if (el.dataset.assetFilter) { assetFilter = el.dataset.assetFilter; renderAssets(); }
  });

  const I = D.implementation;
  list("gaps", I.current_gaps);
  list("performance", I.performance_proposals);
  list("done", I.definition_of_done);
  list("evidence", D.evidence_notes);
  const contract = I.asset_contract;
  $("contract").innerHTML = `<p>${esc(contract.coordinate_system)}</p><p>${esc(contract.state_connection)}</p><p class="contract-fields">공통 필드<br>${contract.required_fields.map(f=>`<code>${esc(f)}</code>`).join(" · ")}</p><p class="contract-fields">그룹<br>${contract.scene_groups.map(f=>`<code>${esc(f)}</code>`).join(" · ")}</p><p>${esc(contract.formats_proposed)}</p>`;
  $("build-order").innerHTML = I.build_order.map(s => `<li><span>0${esc(s.stage)}</span><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p></li>`).join("");
  renderShots(); renderMotions(); renderAssets();
  setVideo("V02",12);
})();
