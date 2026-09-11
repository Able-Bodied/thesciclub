# thesciclub
Codebase for The SCI Club app

## Seeing the app

`pnpm shoot` drives a real browser against a running dev server and writes PNGs
to `screenshots/`. It signs in with the test phone number from
`supabase/config.toml`, so it lands inside the club rather than at the welcome
screen.

```bash
pnpm dev                       # or: vite --port 5181 --strictPort
pnpm demo-member               # once after a db reset — see below
pnpm shoot /events /me --both  # phone and desktop widths
pnpm shoot /events --text=larger
```

`pnpm demo-member` gives the local test account a member row. `supabase db
reset` drops the auth schema with everything else, so without it every sign-in
lands in onboarding.

**Installing the browser.** `pnpm exec playwright install chromium` fetches it.
On a machine with root, `--with-deps` adds the system libraries too. Without
root, unpack them into a cache directory and the `pnpm shoot`/`pnpm logos`
scripts will find them:

```bash
mkdir -p ~/.cache/thesciclub-browser-libs/debs && cd $_
apt-get download libnspr4 libnss3 libasound2t64
for d in *.deb; do dpkg-deb -x "$d" ../root; done
```

## Organization logos

`pnpm logos` says which organizations still need one, pulls candidates off a
site, and renders them into the real badge so you can see what you are picking.

```bash
pnpm logos                                  # what is missing
pnpm logos --find https://example.org       # pull candidates
pnpm logos --sheet                          # look at them at 96px and 38px
pnpm logos --upload SC=03-example.org.png   # put one in the bucket
```

The look is the point, and it is why the ingest job does not do this
automatically. Two candidates that any scraper would have taken were wrong:
High Fives publishes its logo in white for a dark header (it renders as an empty
square), and Canine Companions' header mark is a wide wordmark that letterboxes
into a strip. Neither is detectable from the URL or the alt text.
