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
- A **peer mentor** can add ten. Administrators, organization accounts, and members linked to speak for an organization can invite without a limit (2026-10-09).
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

## Leaving

A member can delete their own account from Me (2026-10-01, for members'
privacy and Twilio's requirements). It erases the person: name, phone number,
photo, birthday, injury and everything they answered, the sign-in account, and
every invite holding their number — coming back takes a new invite. What they
wrote in Chat stays, so other people's conversations still make sense, and says
"Deleted member" where their name was; a report keeps its copy of reported words
with nobody named. The member left in a direct conversation with a deleted
member can delete it (2026-10-05): every message from both of them and every
photograph go, and a report keeps its copy. An administrator cannot delete
their own account from the app. The same "Deleted member" stands for anybody whose account is gone,
including somebody an administrator removed.

## Vocabulary

Use these words exactly. Do not invent synonyms.

- **Member** — anybody in the club. Everybody is one.
- **Mentor** — a member who has agreed to be one, and appears first to newly injured members. An
  attribute of a member, not a separate kind of person.
- **Organization** — a hospital, foundation or programme that can vouch for numbers and run events. An administrator can designate an organization account and link accounts that speak for it. Organization accounts manage the details and events of their linked organizations; this grants no club administrator powers (2026-10-09). Administrator-linked accounts show “Represents” tags on their member profiles, linking to the organizations they speak for; self-described affiliations remain separate.
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

Five surfaces are real, and everything else is deliberately not yet.

| Surface | State | Notes |
| --- | --- | --- |
| **Home** | Real | Where the app opens (2026-09-30). A second way in to rooms, events and members that already exist, not a new kind of content: recent topics and photographs from the open rooms, upcoming events with their RSVPs, and members worth meeting, under Everything · Topics · Photos · Events · People, narrowed by room and place. Asking a question there starts a topic in a room, typed into a box at the top of Home (and of every room) and posted from it, General unless the asker picks another; a question asked as one is drawn large on a coloured band, and the asker or an administrator can move it to the right room afterwards (2026-10-09); sharing a photograph starts a topic whose first post has it; a comment is a reply on the topic page. Likes, with the names shown to every member who can read the room, and a notification to the post's author for each (2026-10-01, at the owner's word). Every standing post has Like, a like count and a view count, including zero; members may like their own posts too (2026-10-10, the owner). Built in eight steps, 2026-09-29 to 2026-10-01. A bell on Home (the top bar on a desktop) opens the notifications of the last 30 days, each opening the message, post or event it is about (2026-10-09). No anonymous asking, no search across it, no comments sheet. |
| **Peers** | Real | The members deck — peers and mentors, ranked, filterable. |
| **Events** | Real | Ingested from partner organization calendars, with RSVPs. Administrators add, edit and remove organizations in Admin, and link accounts that speak for them (2026-10-09). Administrators and designated organization representatives can also add, change and delete events entered in the club (2026-10-06); a representative acts only for their organizations. Administrators can name a community host. Scraped events are changed on their source calendar. |
| **Onboarding + profile** | Real | Invite check, phone verification, then the profile survey. |
| **Chat** | Real | Conversations, groups, and rooms — built 2026-09-18 to 2026-09-20. Any member writes in any open room, no joining (2026-09-29). A member edits their own post or message, readers see "Edited", and administrators can read every earlier version; a reply to a post sits under it, and a reply to a message quotes it (all 2026-09-29). Replies can answer specific replies at any depth, with each conversation branch independently collapsible; like counts say "5 likes" without a thumbs-up icon (2026-10-09). Sent messages show "Read" in direct conversations and "Read by X of Y" in groups, updating live when other participants open the conversation (2026-10-08). Anybody in a group can rename it or give it a picture, and the conversation says who; an event's group keeps the event's name (2026-09-30). A conversation starts from a profile's Message button or from New message on Chat (2026-10-10). No search, no member-to-member blocking, no anonymous posting. Photographs from 2026-09-21. A link shows its page's picture and title, read once by the club so a reader's phone contacts nobody (earlier links are caught up when previews are switched on), and a YouTube video plays in place on a press; Instagram and everything else open their page (2026-10-06). Notifications from 2026-09-27: messages, replies, being added to a group, event reminders, new events from followed organizations, a joined invite, and reports for administrators — see HANDOFF.md for exactly what a lock screen may say. |

A placeholder says plainly that it is not built. It does not show invented content. A screen that
looks finished and does nothing gets demoed, believed, and then explained. **That rule governed Home
until it was built, and Chat the whole way through**, and it still decides what both draw: no control
for a thing they do not do. Chat has no search box (the mock has one) and no block; Home has no
search and no "Ask anonymously". A member who looks for one of those finds nothing at all,
which reads as unfinished; a control that does nothing reads as broken.

## Deliberately deferred

Real, wanted, and explicitly not now. If a task seems to need one of these, say so rather than
quietly scoping it in.

- **Mentor badging** (e.g. "Craig-certified").
- **Coordinator tooling**, classifieds, equipment exchange, AI-assisted matching.

**The Home feed was on this list until 2026-09-29**, when the owner asked for it. What kept it here
was that it needed four content types and a moderation story. It was answered by adding no content
type at all: a question is a topic in a room, a photo post is a topic whose first post has
photographs, a comment is a reply, and a suggestion is a member already in Peers. So reporting,
removal, notifications, mutes and the administrators' tools reach everything on Home without a line
changed. The one new thing is a like, which is a member's name against a post and holds no words.
It was built and released in eight steps from 2026-09-29 to 2026-10-01, and the app opens on it
from 2026-09-30.

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
theirs. An administrator can close it, which was the whole moderation lever until 2026-09-27; from
then an administrator can also delete a single topic and everything in it, for a topic that should
not be there at all (reports keep their own copy). Members still cannot delete a topic, their own
included.

## What is public, and what is not

The club's events and organization pages require membership too (the owner's
choice, 2026-10-08). Shared links resume after sign-in; they do not provide
public access. Legal and sign-in pages remain available without an account.
The club's content is not intended for search indexing.

A public directory of disabled people with names, photos, injury levels and
catheter preferences is a scraping target and a training-data donation. Member pages carry
`noindex`, and the API requires a session. `browse_members` is the single projection through which
one member is visible to another, and it does not select `phone` or `birth_date` at all.

Photographs are behind sign-in too. Until 2026-10-01 they were not: the photos bucket was public,
and a link copied out of the app opened a member's face for anyone, for ever. The owner chose to
close it. Every face and logo is now drawn through a signed URL that lasts an hour, asked for under
the reader's own session, and storage signs only what the reader may see: a member sees every
photograph; anybody signed in sees the organizations' logos, which are public on their own sites
anyway, and their own upload; somebody part-way through joining sees the face on the profile they
may claim. Nobody signed out sees any of them.

Phone numbers stay inside the club with one exception, the owner's practice from 2026-10-08:
**when a member chooses Going for an event, that event's host receives their phone number**, for
that event only, to tell them about changes, remind them and look after the people who come, and
never for marketing, fundraising or promotions. Choosing Interested shares nothing. The Going button
says so before it is pressed, and the Privacy Policy's "Event hosts" says so at length; the two are
kept in step. The app does not hand the numbers over itself.

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

One repo, shipping to https://thesciclub.com (Netlify builds `main`; www and the old
thesciclub.netlify.app address lead to the same app). The app itself is the reference for how
screens look and read, and where it conflicts with this document, this document wins.

The design mock that used to be the reference, and was published at www.thesciclub.com, was
removed on 2026-10-03 once the domain served the real app; it had fallen out of date. Code comments
that name `docs/index.html` mean that mock: `git show 3a9ddd0:docs/index.html`.
