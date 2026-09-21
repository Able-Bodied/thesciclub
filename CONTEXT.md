# Context

What The SCI Club is, who it is for, and what it deliberately is not. Read this before building
anything. Where this file and any other document disagree, this one wins.

## Mission

The SCI Club is a private community for people living with spinal cord injury. Members find peers,
find mentors, and find something worth going to.

Two things make it different from every general disability app, and both are constraints rather
than features:

**Spinal cord injury only.** Not a disability forum, not a chronic illness network. Everyone here
shares a vocabulary from the first screen — level, complete or incomplete, years since injury,
bowel programme, transfers, catheters. That vocabulary is the product. It is why a member can ask
a question here they could not ask anywhere else, and it is the one thing that cannot be
retrofitted later onto something broader.

**Invite only.** A member organization or a peer mentor puts your phone number on the list before
you can join. The app itself cannot let you in. This is not a growth tactic — it is what makes the
first two true. A closed room of two hundred people who have all been through it is worth more
than an open one with twenty thousand registrations and fifty monthly visitors.

## Why closed, specifically

CareCure — the best-known SCI forum — has roughly 20,000 registered members and around 50 monthly
visitors. The lesson is not that online SCI community does not work. It is that an open door and a
registration form do not produce a community; they produce a directory of abandoned accounts.

So membership is granted by a person, not claimed by a form:

- A **member organization** (NorCal SCI, SCVMC SCI Peer Support) adds numbers.
- A **peer mentor** can add ten.
- The QR code gets somebody the app. It does not get them in. Somebody still has to add the number.
- Membership can be taken away. Selling to members, harassing anyone, giving medical advice as
  fact, or repeating outside a room what was said in it — any of those end it.

That last point is load-bearing and must stay reachable in the product. A club where membership
cannot be lost is not a club.

It no longer has to be *printed* on the Standing card, which is what this said until 2026-09-18.
The owner's call: the card says where a member stands, and the four things above go in the terms
of service when there is one to link to. Until then they are one control away, on the card, opening
on hover, on focus and on tap — reachable is the requirement, not permanently on screen.

Losing a membership has to be actionable too, and from 2026-09-20 it is. Direct and group conversations are
private even from administrators: nobody can read a thread they are not in, by design. That left
harassment in a direct message — one of the four things above — witnessed only by the person it
happened to. So a member can **report a single message, or a single post**, and that one message
alone is disclosed: its words, who wrote it, when, and where in words ("a direct conversation").
Not the thread, not what was said before or after it, and no way back into the conversation from
the administrators' screen. The copy of the words is taken at the moment it is reported, so
deleting what you sent is not a way out of it. The person reported is not told.

## Vocabulary

Use these words exactly. Do not invent synonyms.

- **Member** — anybody in the club. Everybody is one.
- **Mentor** — a member who has agreed to be one, and appears first to newly injured members. An
  attribute of a member, not a separate kind of person.
- **Organization** — a hospital, foundation or programme that can vouch for numbers and run events.
- **Invite** — one phone number, placed on the list by an organization or a mentor.

There is no "user", no "peer" as an identity (the Peers tab is a surface, not a class of person),
and no "coordinator" — that role belongs to a different product.

## Adults only

Eighteen and over, with no version for anybody younger.

Everything inside the club is written by adults for adults — bowel programmes,
intimacy, catheters, what happened the night somebody was injured — and none of
it is moderated for a younger reader. A minor with a spinal cord injury needs
support, and this is not the place it should come from.

The rule is a trigger on `members`, not a form validation, so it holds however
the row is written. The form states it before asking and explains rather than
silently disabling a button.

## Who it is for

- **Newly injured members.** Want answers and someone who has been there. Hardest to reach, and
  the reason mentors surface first.
- **Experienced members.** Years in, often the best answer to somebody else's worst week.
- **Mentors.** Trained, vouched for, and able to bring ten more people in.
- **Organizations.** Bring their people, run the events, and are the primary way anyone gets in.

## What actually works

Four surfaces are real, and everything else is deliberately not yet.

| Surface | State | Notes |
| --- | --- | --- |
| **Peers** | Real | The members deck — peers and mentors, ranked, filterable. |
| **Events** | Real | Ingested from partner organization calendars, with RSVPs. |
| **Onboarding + profile** | Real | Invite check, phone verification, then the profile survey. |
| **Chat** | Real | Conversations, groups, and rooms — built 2026-09-18 to 2026-09-20. No editing, no attachments, no search, no member-to-member blocking, no push notifications, no anonymous posting. |
| Home | Placeholder | The mixed feed. Needs four content types and a moderation story. |

A placeholder says plainly that it is not built. It does not show invented content. A screen that
looks finished and does nothing gets demoed, believed, and then explained. **That rule still
governs Home**, and it governed Chat the whole way through — which is why Chat draws no control for the
things it does not do. There is no search box (the mock has one), no attachment button, no way to edit a
message and no block. A member who looks for one of those finds nothing at all, which reads as unfinished;
a control that does nothing reads as broken.

## Deliberately deferred

Real, wanted, and explicitly not now. If a task seems to need one of these, say so rather than
quietly scoping it in.

- **The Home feed.** Questions, photo posts, comments, member suggestions.
- **Mentor badging** (e.g. "Craig-certified").
- **Coordinator tooling**, classifieds, equipment exchange, AI-assisted matching.

**Topic rooms were on this list until 2026-09-18** and the owner has decided to build them. The
objection that kept them here has not stopped being true, so it is recorded rather than deleted:
**a room of two dozen members is empty by construction.** The club has five members who are not
seeded directory rows. A room with four posts in it looks abandoned, and the mock's rooms read well
because they were written rather than lived.

That is a design constraint on the build, not a reason to refuse it. It points at opening rooms one
at a time rather than twelve at once, and at an administrator having something to seed a room with
before it is shown to anyone. The reason to build at all is unchanged and good: the club should not
have to depend on CareCure.

From 2026-09-20 the twelve are starters rather than the limit: **any member can start a room**, and
the argument is the one the club is built on — everybody inside has been vouched for by a person.
A member with a problem nobody anticipated should not have to wait for an administrator to have
thought of it first. The emptiness objection is answered by the shape of the flow rather than by a
rule, because no rule makes anybody write: **a room cannot be born empty.** Starting one asks for
its first topic in the same form, and the two are written together or not at all. Nobody renames or
deletes a room afterwards, not even the member who started it — what people write in a room is
theirs. An administrator can close it, which is the whole moderation lever and was already there.

## What is public, and what is not

Two tiers, and the line sits between content and people.

| Public, no account | Behind sign-in |
| --- | --- |
| Events, including online ones | Every member profile |
| Organization pages | Photos, names, bios, topics, levels |
| Marketing pages | Messages, rooms and rosters |

Events are the public shopfront: they are already public on the organizations' own calendars, they
are genuinely useful to somebody without an account, and somebody searching "adaptive handcycling
near me" should land on a real event.

Members are not. A public directory of disabled people with names, photos, injury levels and
catheter preferences is a scraping target and a training-data donation. Member pages carry
`noindex`, and the API requires a session. `browse_members` is the single projection through which
one member is visible to another, and it does not select `phone` or `birth_date` at all.

## How injury is recorded

**Level, completeness, and date of injury.** Not a disability type, not a duration bucket.

Onboarding asks for a coarse level range (C1–C4, C5–C8, T1–T6, T7–T12, L1–S5, or not sure yet)
because that is answerable in one tap by somebody who may be filling this in from a hospital bed.
The profile survey refines it to an exact level later, for anybody who wants to.

Duration is a **date**, not a number of years. A stored year count is wrong within twelve months
of being entered and needs something to roll it forward; a date is simply correct forever. Because
not everybody will give an exact date — and asking somebody for the precise date of the worst day
of their life at minute two of signup is a heavy question — the date carries a precision alongside
it, and year-only is a normal answer rather than a skip. Nothing displays more precision than was
given.

Age is never stored. `birth_date` is, it never leaves the server, and every screen reads an age
derived from it.

## Working model

One repo, shipping to `www.thesciclub.com`. The design mock in `docs/index.html` is the reference
for how screens should look and read — it is a prototype, not a spec, and where it conflicts with
this document, this document wins.
