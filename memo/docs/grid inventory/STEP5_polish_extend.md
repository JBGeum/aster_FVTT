# STEP 5 — 마감 및 확장

> 목표: 가방 교체 시 창고 이관, 다중 영역(EQUIPMENT/BASKET/COMPA), 시각 마감.
> 선행: STEP4까지 완료.
> 도구: Cursor 권장(대부분 UX/시각).

---

## 5-1. 가방 교체 시 창고 이관

bag은 1개 제약(STEP1). 가방을 바꾸려면 기존 가방을 지우거나 교체하는데, 그때 가방 안 아이템 처리가 필요하다.

확정 규칙(앞선 논의):

- 가방이 제거되면, 그 가방에 속했던 아이템(`container === 제거된 가방 id`)을 **창고로 이관**(`container=""`).
- 이때 창고 개수 제한을 **임시 초과해도 수용**(이관은 막지 않음).
- 초과 상태에서는 창고 추가 불가(STEP4 `checkStorageAdd`가 이미 처리). 꺼내기로 한도 이하 만들 때까지 추가 차단.

```js
Hooks.on("preDeleteItem", (item) => {
  if (item.type !== "bag") return true;
  const actor = item.parent;
  if (!actor) return true;
  // 이 가방 소속 아이템을 창고로 (초과 허용)
  const orphans = actor.items.filter((i) => i.system.container === item.id);
  // 비동기 처리: deleteItem 후 일괄 update (preDelete에서 직접 await 불가 시 deleteItem 훅 사용)
  Hooks.once("deleteItem", async () => {
    const updates = orphans.map((i) => ({
      _id: i.id,
      "system.container": "",
      "system.grid": { x: 0, y: 0 },
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
  return true;
});
```

> **확인:** 가방 "교체" UX를 어떻게 노출할지(삭제 후 새로 생성? 전용 버튼?) 게임 흐름에 맞게. 위는 삭제 시 이관 기준.
> 초과 수용은 "이관은 허용, 신규 추가만 차단"이므로 STEP2 로직과 모순 없음.

---

## 5-2. 다중 영역 (EQUIPMENT / BASKET / COMPA)

이미지 2 하단 4영역. 기본 구현은 가방(BAG) 단일 격자. 나머지는 여기서 확장.

- **EQUIPMENT(장비), BASKET(바구니):** 가방과 같은 격자 패턴을 별도 영역으로 추가하거나, 단순 슬롯 목록으로 둘지 결정 필요.
  - 격자로 간다면: 각 영역도 `grid{cols,rows}`를 갖는 별도 컨테이너로. 아이템 `container`가 가방 id 대신 영역 식별자를 가리키게 확장.
  - **확인:** EQUIPMENT/BASKET이 격자인지 단순 슬롯인지 — 이미지만으론 불명. 게임 규칙 확인.
- **COMPA(사역마/companion):** 아이템과 성격이 다를 가능성 큼(별도 actor? 링크?). 격자 인벤토리와 분리해 별도 설계 권장. **추후 논의.**

---

## 5-3. 창고 용량 → craft 스킬트리 연동 (추후)

현재 `system.storage.limit`는 수동 입력값. craft(스킬트리) 구현 시 스킬 기반 파생값으로 대체.

- 연동 시점에 input 필드를 read-only 표시로 바꾸고, 값은 스킬 효과 합산으로 계산.
- 이 STEP에서는 구현하지 않음. craft 구현 후 별도 작업.

---

## 5-4. 시각/편의 마감

- 이미지 2 테마(어두운 우드/양피지)에 맞춘 격자·슬롯 스타일.
- 선택 UI를 DialogV2 드롭다운 → 썸네일 팝업으로 업그레이드(선택).
- 빈 칸 hover 시 배치 가능 영역 미리보기(클릭 전 size만큼 하이라이트).
- 겹친 아이템 시각 구분(외곽선/z-index).
- (선택) 자동 정렬 버튼: 가방 아이템 좌표를 좌상단부터 재배치.
- (선택) 드래그 배치 추가: 클릭-선택 위에 드래그를 얹기(데이터 모델 동일하므로 후속 가능).

---

## 5-5. 완료 기준

- 가방 제거 시 소속 아이템 창고 이관(초과 수용), 이후 추가 차단 동작.
- (다중 영역 구현 시) 영역별 배치/경고 동작.
- 시각: 이미지 2 근접.
- 회귀: 단일 가방 기능 유지.

## 사람 확인 항목

- [ ] 가방 교체 UX(삭제 기반 vs 전용 버튼).
- [ ] EQUIPMENT/BASKET: 격자 vs 단순 슬롯.
- [ ] COMPA(사역마) 설계 — 별도 논의.
- [ ] craft 연동 시점.
