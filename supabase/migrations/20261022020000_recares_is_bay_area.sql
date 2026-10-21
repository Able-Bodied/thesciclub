-- ReCARES gives equipment away from sites in Oakland, San Francisco and Marin
-- County (recares.org), not Palo Alto. The owner, 2026-10-20: "Bay Area".
update public.organizations set city = 'Bay Area' where short_code = 'RC';
