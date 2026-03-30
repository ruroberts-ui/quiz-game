# Quiz Elimination Game — Project Spec
> A hosted, real-time elimination quiz game for large groups of work colleagues. Players join via QR code on their phones. One winner survives.

---

## The Problem

Running an engaging group quiz at a work event is hard. Printed answer sheets are slow, apps like Kahoot feel corporate and dated, and nothing builds genuine tension. This game needs to feel like a TV game show — dramatic, fast, and simple enough that anyone can pick up their phone and play without instructions.

---

## The Users

**The Host**
- Runs the game from a laptop or large screen visible to the whole room
- Low technical confidence — needs a simple, reliable control panel
- Uploads a PDF of questions before the game starts
- Advances the game with a single button click

**The Players**
- Work colleagues, mixed ages and tech confidence
- Join by scanning a QR code on the master screen with their phone
- Type in their name and they're in — no account, no app download
- Answer multiple choice questions on their phone within 10 seconds

---

## What "Done" Looks Like

- Host uploads a PDF of questions, sees them parsed and ready to go
- A QR code is displayed on the master screen; players scan it and join
- Host sees all player names appear live on the master screen as they join
- Host clicks **Start Game** when ready
- Each question is displayed on both the master screen and all player phones simultaneously
- Players have 10 seconds to tap their answer; a countdown is visible on both screens
- Wrong answer or no answer = player is eliminated; their name disappears from the master screen with a visual effect
- Correct answerers survive and move to the next question
- This repeats until the final question (question 10, or the last question if fewer than 10)
- On the final question, the winner is the **first** correct answer — speed is the tiebreaker
- A winner screen is shown on the master screen and on the winner's phone

---

## Tech Stack Decisions
*(Made on your behalf — no prior knowledge needed)*

| Concern | Decision | Reason |
|---|---|---|
| Frontend | **Next.js** (React) | Easy to deploy, good for real-time UI |
| Hosting | **Vercel** | Free tier, deploys directly from GitHub |
| Database & Auth | **Supabase** | You already have it; handles real-time updates perfectly |
| Real-time sync | **Supabase Realtime** | Players and host stay in sync without page refreshes |
| QR Code | Generated server-side from the game's join URL | No third-party dependency |
| PDF Parsing | **pdf-parse** (Node.js library) | Extracts question text from uploaded PDFs |
| Repo | **GitHub** | You already have it; connects directly to Vercel |

---

## PDF Question Format

To ensure reliable parsing, questions in the uploaded PDF must follow this structure:

```
Q1. What colour is the sky?
A) Red
B) Blue
C) Green
D) Yellow
Answer: B
```

- Up to 10 questions per PDF
- Exactly 4 answer options per question (A–D)
- One correct answer marked with `Answer:`
- Host sees a preview of parsed questions before starting — can abort if parsing looks wrong

---

## Prioritised Features

### Must Have (v1)
- [ ] Host login via Supabase Auth (email + password)
- [ ] PDF upload and question parsing with preview
- [ ] QR code displayed on master screen linking to join URL
- [ ] Players join by typing their name — no account required
- [ ] Live player list on master screen, updating in real time
- [ ] Host-controlled question advancement (single button)
- [ ] 10-second countdown timer on master screen and player phones
- [ ] Multiple choice answer buttons on player phone (A, B, C, D)
- [ ] Elimination on wrong answer or timeout
- [ ] Player names visually removed from master screen on elimination
- [ ] Final question speed-wins logic
- [ ] Winner announcement screen

### Should Have (v1 if time allows)
- [ ] "Waiting for host" holding screen on player phones between questions
- [ ] Eliminated players see a "You're out" screen (not just a blank page)
- [ ] Basic sound effects (countdown beep, elimination sting, winner fanfare) — using Web Audio API, no external assets needed

### Deliberately Left Out of v1
- Multiple simultaneous game rooms
- Spectator mode
- Leaderboard / scoring beyond win/lose
- Custom timers per question
- Player accounts or history
- Admin dashboard or analytics
- Re-joining after elimination
- Question editing within the app (edit the PDF instead)
- Mobile app (web only)

---

## Design Direction

**Aesthetic:** 1980s British game show. Think Blockbusters, Catchphrase, The Generation Game.

**Colours:** Deep cobalt blue backgrounds, bright gold/amber accents, white text. Strong contrast throughout.

**Typography:** Bold, chunky display font for questions and player names. Clean sans-serif for UI chrome. Consider Google Fonts: *Oswald* or *Bebas Neue* for display, *Inter* for body.

**Animation:**
- Player names should "explode" off the screen when eliminated (not just disappear)
- Countdown timer pulses or changes colour in the final 3 seconds
- Question reveal should feel dramatic — slide or flash in

**Master screen layout:**
- Top half: current question + answer options
- Bottom half: grid of surviving player names
- Countdown timer prominent and central

**Player phone layout:**
- One screen at a time: waiting → question + timer → result
- Buttons large enough to tap easily under pressure
- Colour feedback immediately on tap (green = correct, red = wrong)

**Tone:** Warm, fun, slightly camp. This is a party, not a productivity tool.

---

## Supabase Schema (Suggested)

```sql
-- One game exists at a time
games (
  id, status, current_question_index, created_at
)

-- Loaded from PDF upload
questions (
  id, game_id, question_index, question_text,
  option_a, option_b, option_c, option_d, correct_answer
)

-- Created when player scans QR and enters name
players (
  id, game_id, name, is_eliminated, joined_at
)

-- One row per player per question
answers (
  id, player_id, question_id, answer_given,
  is_correct, answered_at
)
```

---

## Game State Flow

```
LOBBY → IN_PROGRESS → FINAL_QUESTION → COMPLETE
```

- **LOBBY:** QR code shown, players joining, host sees names populate
- **IN_PROGRESS:** Questions 1–9 (or until one player remains), host advances each
- **FINAL_QUESTION:** Last question — first correct answer wins
- **COMPLETE:** Winner displayed, game can be reset

---

## Constraints & Assumptions

- Single game session at a time — no multi-room support
- Host must be logged in; players do not need an account
- Internet connection required for all participants throughout
- PDF must follow the specified format — no free-text question support in v1
- Designed for groups of up to ~50 players (Supabase free tier can handle this)
- Works in any modern mobile browser — no app install required
