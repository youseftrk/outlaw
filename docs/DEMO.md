# Stage demo — presenter script

One browser tab, one route: `/drill`. About four minutes, no slides. Every click is
checked by the server, so the story is identical if a judge tries it from a terminal.

## Before you go on

- Open the public URL on `/drill`. Check the top-right says **Live** (not Connecting).
- Press **Start the demo** once. It clears the record and takes the demo system out from
  under its owner, so you begin where a customer begins. Background agents stay quiet for
  twenty minutes after that, so the record only shows your story.
- Keep `/agents` open in a second tab for "what do the six agents do?".

## The one line

> Qalaa is one switch that grants — and instantly takes back — an AI agent's power over
> someone else's system. Every ask, yes, action and stop is written down.

## Script

The page tells you who you are at each step ("You are the owner", "You are the responder").
The record on the right fills in as you go — glance at it after every click.

| Step | Click | Say |
| --- | --- | --- |
| 1. Problem | — | "The UAE is moving half of government services onto AI agents within two years. Agents from one authority will need to act inside another authority's systems — in emergencies, in minutes. Today that means a standing admin role nobody can take back. Qalaa replaces it with a permission you can switch off in one second." |
| 2. Onboard | Pick owner **National Data Authority**, tick the data it holds, **Put it under Data** | "Setup is one screen: who owns the system and what data lives on it. Personal data here — the owner never shares that, whatever anyone asks. That is the whole install." |
| 3. Refused | **Try it** | "Hisn is our response agent. It tries to contain this machine — refused. No permission exists. That answer came from the server, not the screen." |
| 4. Ask | **Ask Data for permission** | "Hisn asks for the smallest thing that works: this action, this system, this reason, one hour. Not a role. A permission with an end." |
| 5. Owner decides | **Yes, allow it** | "The owner of the system decides — never the requester. That is sovereignty in practice: the authority that holds the data keeps the decision." |
| 6. Human code | Type the six-digit code shown on the card → **Confirm** | "Containing a production system is sensitive, so a person confirms with a one-time code. Generated on the server, works once, expires in five minutes." |
| 7. Allowed | **Try it** | "Same agent, same action, same system — now allowed. On the right: the allowed action is written down with the permission it ran under." |
| 8. Take it back | Flip the switch on the card → **Take it back now** | "Something changes. The owner flips the switch." |
| 9. Refused again | **Try it** | "The very next call: permission taken back. No cache, no grace period." |
| 10. Record | Point at **What happened** | "Top to bottom: onboarded, refused, asked, yes, code, allowed, taken back, refused. Written by the backend, readable by an auditor who knows nothing about code." |
| 11. Close | — | "Six agents, each with one job, none with standing power. Owners keep their data and their decision. That is Qalaa." |

## If a judge pushes

- **"Is this just UI state?"** — From a terminal:
  `curl -X POST <url>/api/protected/ent-data/contain -H 'content-type: application/json' -d '{"actorId":"agt-hisn","serverId":"srv-dataset-worker-02"}'`
  — same 403 / 200 / 403 as the button.
- **"What if an agent asks for data the owner never shares?"** — `/permissions`, owner card:
  house rules. Personal data is never shared and permissions cap at two hours; requests
  outside the rules are refused before a human sees them.
- **"How hard is it to adopt?"** — The check sits in front of the existing API. The owner
  writes house rules once; nothing else changes.
- **"What do the agents actually do?"** — `/agents`: each card says its job in a sentence
  and what it may *ask* permission to do. Lime chips need a human code as well.

## If something breaks

- Status shows **Connecting**: refresh once; the page falls back to polling within four seconds.
- A step looks stuck: **Start over** and rerun from step 2 — it takes ten seconds.
- Code rejected: codes are single-use and expire after five minutes. Say yes again for a new one.
