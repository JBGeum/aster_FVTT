import { describe, expect, it } from "vitest";
import { DAMAGE_STATUSES, badstatusI18nKey } from "../module/helpers/health-status.mjs";

describe("badstatusI18nKey", () => {
  it("bigInj만 필드명과 lang 키가 다르다", () => {
    expect(badstatusI18nKey("bigInj")).toBe("ASTER.badstatus.biginj");
  });

  it("나머지 넷은 키를 그대로 쓴다", () => {
    expect(badstatusI18nKey("injury")).toBe("ASTER.badstatus.injury");
    expect(badstatusI18nKey("sleepy")).toBe("ASTER.badstatus.sleepy");
    expect(badstatusI18nKey("exhaustion")).toBe("ASTER.badstatus.exhaustion");
    expect(badstatusI18nKey("hungry")).toBe("ASTER.badstatus.hungry");
  });

  it("목록에 없는 키는 그대로 붙인다", () => {
    expect(badstatusI18nKey("unknown")).toBe("ASTER.badstatus.unknown");
  });

  it("DAMAGE_STATUSES의 모든 키가 그 항목의 i18n 이름으로 간다", () => {
    for (const def of DAMAGE_STATUSES) {
      expect(badstatusI18nKey(def.key)).toBe(`ASTER.badstatus.${def.i18n}`);
    }
  });
});
