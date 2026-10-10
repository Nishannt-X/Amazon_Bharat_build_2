import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, groupLocalReports, reportAgeLabel, type LocalFloodReport } from "./report";

function report(id: string, lat: number, lng = 77): LocalFloodReport {
  return { id, lat, lng, reportCount: 1, reportedAt: `2026-10-10T10:0${id}:00.000Z`, locationLabel: id,
    photoUrl: `blob:${id}`, photoName: `${id}.jpg`, vehicle: { make: "Honda", model: "Activa 6G", year: "2020", variant: "" } };
}

describe("nearby local evidence", () => {
  it("measures meters across latitudes and the date line", () => {
    const equator = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });
    const north = distanceMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 0.001 });
    assert.ok(equator > 111 && equator < 112);
    assert.ok(north > 55 && north < 56);
    assert.ok(distanceMeters({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 }) < 25);
    assert.equal(distanceMeters({ lat: 20, lng: 77 }, { lat: 20, lng: 77 }), 0);
  });
  it("retains every photo and chooses the oldest stable anchor", () => {
    const first = report("1", 20);
    const nearby = report("2", 20.00015);
    const far = report("3", 20.001);
    const groups = groupLocalReports([far, nearby, first]);
    assert.equal(groups.length, 2);
    const grouped = groups.find((group) => group.reports.length === 2)!;
    assert.equal(grouped.anchor, first);
    assert.deepEqual(grouped.reports, [nearby, first]);
    assert.equal(grouped.reports[1].photoUrl, "blob:1");
    assert.deepEqual(groupLocalReports([first, far, nearby]), groups);
    assert.equal(groupLocalReports([far, nearby]).flatMap((group) => group.reports).length, 2);
  });
  it("does not connect distant pins through a chain of neighboring reports", () => {
    const groups = groupLocalReports([report("1", 20), report("2", 20.00018), report("3", 20.00036)]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.find((group) => group.id === "1")!.reports.map((item) => item.id), ["2", "1"]);
  });
  it("handles empty evidence", () => assert.deepEqual(groupLocalReports([]), []));
});

describe("evidence age", () => {
  const saved = "2026-10-10T10:00:00.000Z";
  const start = Date.parse(saved);
  it("updates minute, hour and day boundaries from the actual timestamp", () => {
    assert.equal(reportAgeLabel(saved, start + 59000), "Saved just now");
    assert.equal(reportAgeLabel(saved, start + 60000), "Saved 1 min ago");
    assert.equal(reportAgeLabel(saved, start + 3600000), "Saved 1 hr ago");
    assert.equal(reportAgeLabel(saved, start + 86400000), "Saved 1 day ago");
    assert.equal(reportAgeLabel(saved, start + 172800000), "Saved 2 days ago");
  });
  it("does not claim freshness for invalid or future timestamps", () => {
    assert.equal(reportAgeLabel("bad", start), "Time unavailable");
    assert.equal(reportAgeLabel(saved, start - 1), "Time is ahead of this device");
  });
});
