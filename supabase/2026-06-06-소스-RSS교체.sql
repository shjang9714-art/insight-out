-- 실패한 RSS 소스 URL 교체
-- 2026-06-06 curl 및 프로젝트 rss-parser 기준:
-- HTTP 200, 유효 RSS XML, 최근 게시물 포함을 확인했다.
-- 기존 행만 갱신하므로 반복 실행해도 결과가 같은 멱등 스크립트다.

update public.sources
set rss_url = 'https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94',
    is_active = true
where name = '과학기술정보통신부';

update public.sources
set rss_url = 'https://www.ddaily.co.kr/rss.xml',
    is_active = true
where name = '디지털데일리';

update public.sources
set rss_url = 'https://www.itworld.co.kr/feed/',
    is_active = true
where name = 'ITWorld Korea';

update public.sources
set rss_url = 'https://news.sktelecom.com/feed',
    is_active = true
where name = 'SKT';

-- 최신 RSS는 존재하지만 item/title 안에 HTML <a> 요소가 들어 있어
-- 현재 rss-parser가 제목을 문자열이 아닌 객체로 반환한다.
-- 크롤러 어댑터와 호환되는 공식 피드를 찾을 때까지 비활성화한다.
update public.sources
set is_active = false
where name = 'Fierce Network';
