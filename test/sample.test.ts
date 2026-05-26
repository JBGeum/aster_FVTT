import { describe, expect, it } from "vitest";

/**
 * 샘플 테스트.
 * Foundry 런타임 객체(Roll, ChatMessage 등)를 다루는 로직은
 * 별도의 어댑터 함수로 추출한 뒤 여기서 mock으로 검증하는 패턴이 깔끔합니다.
 */
describe("sanity", () => {
  it("vitest 환경이 정상적으로 동작한다", () => {
    expect(1 + 1).toBe(2);
  });

  it("emotion roll 보정치는 favColor일 때 +1", () => {
    const computeFormula = (isFavColor: boolean) => (isFavColor ? "2d6+1" : "2d6");
    expect(computeFormula(true)).toBe("2d6+1");
    expect(computeFormula(false)).toBe("2d6");
  });
});
