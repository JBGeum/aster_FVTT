# STEP 3 — 고정 트리 렌더

> 목표: CRAFT_TREE를 카테고리별로 항상 같은 형태로 그린다. 체크박스/비용/연결선 표시.
> 선행: STEP1, MIGRATION TASK 3(PARTS의 craft part).
> 산출: 커밋 1개. `feat(craft): render fixed skill tree with checkboxes and links`
> 도구: Claude Code 골격 → Cursor 시각(연결선·테마).

---

## 3-1. 컨텍스트 준비

`actor-sheet.mjs`의 craft part 컨텍스트. 트리 정의 + 취득 상태 + 각 노드의 표시 플래그를 만든다.

```js
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { prereqMet, sumCost, checkAffordable } from "../helpers/craft-cost.mjs";

_prepareCraft(context) {
  const acquired = this.actor.system.craft?.acquired ?? {};
  const resources = {
    material: this.actor.system.material ?? 0,
    aster: {
      red: this.actor.system.aster?.red?.value ?? 0,
      blue: this.actor.system.aster?.blue?.value ?? 0,
      green: this.actor.system.aster?.green?.value ?? 0,
      yellow: this.actor.system.aster?.yellow?.value ?? 0,
      white: this.actor.system.aster?.white?.value ?? 0,
    },
  };

  // 카테고리별로 노드 그룹화 + 표시 플래그
  const byCat = {};
  for (const cat of CRAFT_TREE.categories) byCat[cat.id] = { ...cat, nodes: [] };
  for (const node of CRAFT_TREE.nodes) {
    const isAcquired = acquired[node.id] === true;
    const unlocked = prereqMet(node.id, acquired);  // 선행 충족 → 체크 가능 상태
    byCat[node.category].nodes.push({
      ...node,
      acquired: isAcquired,
      unlocked,
      locked: !unlocked && !isAcquired,             // 선행 미충족 → 잠금 표시
      costLabel: formatCost(node.cost),             // "◆20 ◇2/0/0/1" 또는 "◇임의 4"
    });
  }

  // 현재 취득 합계가 자원 초과 상태인지 (상시 빨강 표시용)
  const afford = checkAffordable(acquired, resources);

  context.craft = {
    categories: CRAFT_TREE.categories.map((c) => byCat[c.id]),
    overBudget: !afford.ok,
    overReasons: afford.reasons,
    cost: sumCost(acquired),
    resources,
  };
}

function formatCost(cost) {
  const parts = [];
  if (cost.material) parts.push(`◆${cost.material}`);
  const a = cost.aster;
  if (a.red || a.blue || a.green || a.yellow) parts.push(`◇${a.red}/${a.blue}/${a.green}/${a.yellow}`);
  if (cost.anyAster) parts.push(`◇임의 ${cost.anyAster}`);
  return parts.join(" ");
}
```

---

## 3-2. 템플릿 (actor-main-craft.html)

```hbs
<section class="tab craft-tab" data-tab="craft" data-group="primary">

  {{!-- 자원 요약 + 초과 경고 --}}
  <div class="craft-summary {{#if craft.overBudget}}over{{/if}}">
    <span>◆ {{craft.cost.material}} / {{craft.resources.material}}</span>
    <span class="aster-sum">◇ 취득 비용 합 (보유 내 여부)</span>
    {{#if craft.overBudget}}<span class="over-badge">{{localize "ASTER.craft.over"}}</span>{{/if}}
  </div>

  {{#each craft.categories as |cat|}}
  <div class="craft-category" data-category="{{cat.id}}">
    <h3>{{localize cat.label}}</h3>
    <div class="craft-nodes">
      {{#each cat.nodes as |node|}}
        <div class="craft-node {{#if node.acquired}}acquired{{/if}} {{#if node.locked}}locked{{/if}}"
             data-skill-id="{{node.id}}">
          <input type="checkbox"
                 data-action="toggleSkill" data-skill-id="{{node.id}}"
                 {{checked node.acquired}}
                 {{#if node.locked}}disabled{{/if}} />
          <div class="node-body">
            <div class="node-title">{{localize node.label}} <span class="lv">Lv.{{node.level}}</span></div>
            <div class="node-cost">{{node.costLabel}}</div>
          </div>
        </div>
      {{/each}}
    </div>
  </div>
  {{/each}}

  <button type="button" data-action="craftReset" class="craft-reset">
    {{localize "ASTER.craft.reset"}}
  </button>
</section>
```

> `checked` 헬퍼는 기존 `templates.mjs`에 이미 등록돼 있음(재사용).

---

## 3-3. 연결선(선행 관계 시각화)

이미지의 색 막대(노드 간 연결)는 시각 요소다. 두 가지 방법:

- **간단:** 카테고리 안에서 노드를 레벨 순으로 가로 배치하고, CSS로 인접 노드 사이에 연결선(`::before`/border)을 그림. 선형 트리(가마솥 1-2-3)에 적합.
- **정확:** 분기(소중한 물건 등)는 SVG 오버레이로 `requires` 관계를 선으로 연결. Cursor에서 좌표 잡아가며 작업.

> 기본 구현은 "간단"으로 가고, 분기 시각화는 STEP4 이후 Cursor 마감에서 SVG로 처리. 기능(취득)은 연결선 없이도 동작하므로 시각은 후순위.

---

## 3-4. 스타일 핵심

```scss
.craft-node {
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid #999;
  border-radius: 4px;
  &.acquired {
    background: rgba(60, 160, 60, 0.15);
    border-color: #3a3;
  }
  &.locked {
    opacity: 0.45;
  } // 선행 미충족 잠금
  .node-cost {
    font-size: 0.8em;
    color: #555;
  }
}
.craft-summary.over .over-badge {
  color: #c0392b;
  font-weight: bold;
} // 초과 빨강
```

## 3-5. 검증

```bash
npm run build
# Foundry: craft 탭 → 카테고리/노드/비용/체크박스 표시
#          선행 미충족 노드는 disabled(잠금), 취득 노드는 초록
#          취득 합계가 자원 초과면 상단 빨강 배지
```

## 완료 기준

- CRAFT_TREE가 카테고리별로 고정 렌더.
- 취득=초록, 잠금(선행 미충족)=흐림+disabled, 비용 표시.
- 초과 시 상단 빨강 표시.
- 인터랙션(체크 동작)은 STEP4.

## 사람 확인 항목

- [ ] 연결선: CSS 간단 vs SVG 정확(Cursor).
- [ ] 자원 요약 표기 형식.
