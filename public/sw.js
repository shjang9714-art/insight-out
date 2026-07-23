// 설치 가능 조건(fetch 핸들러 존재)만 충족하는 pass-through SW.
// ⚠️ 캐싱하지 않는다 — stale 배포 방지가 오프라인 캐시보다 우선.
// 오프라인 캐시 전략은 별도 슬라이스에서 network-first 로 신중히 도입한다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", () => {
  // 네트워크로 그대로 통과
});
