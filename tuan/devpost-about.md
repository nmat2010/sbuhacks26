## Inspiration

Students want to do research. Professors want students who actually know what they are doing. Between them sits a growing problem: **over-reliance on AI**.

- **92%** of UK undergraduates now use generative AI, up from 66% a year earlier. **88%** have used it for graded assessments (up from 53%), and **18%** have pasted AI-generated text straight into their work. Only **36%** have been taught how to use it well ([HEPI Student Generative AI Survey 2025](https://www.hepi.ac.uk/reports/student-generative-ai-survey-2025/)).
- In a study of 666 people, heavier AI use was significantly linked to **weaker critical thinking**, driven by *cognitive offloading* (letting the tool think for you). **Younger participants were the most dependent and scored lowest** ([Gerlich, *Societies*, 2025](https://papers.ssrn.com/abstract=5082524)).

Copy-paste gets the homework done but skips the learning. That is exactly the skill a researcher can't fake: sitting with a hard problem, reading a dense paper, being stuck and getting unstuck. We wanted an AI that trains that skill instead of replacing it.

## What it does

**Wolfie Sensei** is a desktop study companion: a wolf mascot that lives in the corner of your screen while you study.

- **Watches with you, with your consent.** In *Watch mode*, Sensei looks at your active window every few seconds and keeps notes on the paper, video or problem set you're on, so you never have to re-explain your context.
- **Nudges you to think first.** When you open an AI chatbot or drift to a distracting site mid-session, Sensei nudges you back. Pausing too long on a question, or writing a wrong answer (even a copied equation with one number changed), gets a gentle "Want a hint?". There's also an **I'm stuck** button.
- **Hints, not answers.** In homework mode, help climbs a five-step hint ladder, from a small nudge to a worked example, and never jumps straight to the answer. In learning mode (papers, lectures), Sensei answers directly, with citations to the page or video timestamp, and suggests real videos and articles to fill the gaps.
- **Talks with you.** Hold to talk, and Sensei reads replies aloud with a natural voice.
- **Writes your session report.** When you stop, Sensei reports what you studied, every problem and how it went (solved on your own, with help, or still open), and next steps.
- **Tracks strengths and weaknesses over time.** The dashboard keeps a record of each skill across sessions (*strength*, *to work on*, *improving*), with evidence and a plan to improve. It also shows a streak and a *self-reliance* view: how much you did without leaning on AI.

## How we built it

- **Desktop app:** Electron, React and TypeScript, with a local SQLite database. Shared, validated data contracts (Zod) connect every part.
- **Seeing the screen:** a small native macOS helper written in Swift finds the exact window in front. Private windows and sensitive sites (banking, email) are never captured, and screenshots are never stored.
- **Google Gemini:**
  - a fast *flash-lite* watcher model describes each look and checks visible answers;
  - a second model answers questions from the whole session, writes the hint ladders, the session reports and the skill record;
  - Gemini can also watch the YouTube lecture you are on.
- **ElevenLabs:** streaming text-to-speech for Sensei's voice, and speech-to-text for push-to-talk.
- **Extras:** a Chrome extension reports the active tab, and an iPad web app connects over the local network.
- **Quality:** about **700 automated tests**, plus scripted runs of the real app (real clicks, real scrolling, real audio and model calls) on throwaway profiles.

We worked in parallel from day one, using a shared spec, separate branches, a coordination doc and written handoffs. Tuan built the brain: monitoring, the hint engine, Watch mode, voice, reports and the skill record. Thu built the face: the mascot and its sprite animations, the overlay, onboarding, the dashboard design and the iPad app. Tuan also used Claude Code as a pair programmer for planning, review and testing, practicing the same rule the app teaches: use AI to help you think, not to stop thinking.

## Challenges we ran into

- **Seeing the right window.** macOS hides window titles from other apps, so our first screenshots were blank. We wrote a native helper, then had to handle switching windows mid-capture, private browser windows, and an overlay that swallowed scrolling (found by sending real operating-system scroll events).
- **Helping without giving it away.** Telling *learning* (answer directly) from *homework* (hint only) took several prompt versions. So did flagging two wrong answers on one page and making the hint match the flagged one.
- **One problem, many names.** The vision model re-words the same problem on every look ("Coin Change", "Implement coinChange to find the minimum…"), which flooded reports with duplicates. We now ask for stable names and merge leftovers when their meaningful words $W$ overlap enough:
  $$|W_a \cap W_b| \ge 3 \quad\text{and}\quad \frac{|W_a \cap W_b|}{\min(|W_a|,\,|W_b|)} \ge 0.7,$$
  as long as numbers like $13$ vs $12$ or "Q2" vs "Q3" still match. For concepts that share no words, the model tidies the skill record by meaning.
- **Free-tier limits.** Gemini's free tier allows only a few requests per day per model, and web search isn't available on it. We split the work across models and built our own link-checked resource finder (top real YouTube result, verified article links), so Sensei never invents a link.
- **Sound.** The app streamed voice audio that nothing was playing. We built a streaming player, and found and fixed a microphone recorder that silently stopped on its own.

## Accomplishments that we're proud of

We're proud of how we worked: two people building in parallel like a professional team, with clear contracts, branches and handoffs. Everything came together and works end to end, from the mascot on screen to the report on the dashboard.

We're also proud of what building it taught us about ourselves. Testing Sensei on our own studying made us admit how much copy-paste had softened our brains. Wolfie Sensei is the tool we want for ourselves, and for every student trying to win back real knowledge while still using AI the right way.

## What we learned

- **Tuan:**
  - multimodal prompting with Gemini, and versioning prompts like code;
  - designing for privacy from the start;
  - that unit tests aren't enough: real-hardware runs found the bugs that mattered (blank windows, swallowed scrolling, silent audio);
  - turning raw signals into fair judgments, such as *strength* needing evidence, not just reading time.
- **Thu:**
  - bringing a character to life with sprite-sheet animation;
  - building transparent, always-on-top overlay windows in Electron;
  - designing onboarding and a dashboard that make performance easy to understand at a glance;
  - shipping a companion iPad web app.
- **Together:** splitting work along clear interfaces lets two people move fast without breaking each other's code. And AI is most valuable when it makes *you* think harder.

## What's next for Wolfie Sensei

- **Focus curve:** see within each session when your attention drops and side-tracking starts.
- **Brightspace integration:** open your course material in one place, and ask questions answered from the professor's own slides and readings.
- **Research mode:** guided paper reading with background-knowledge checks and plans, to help students become research-ready. Optionally, a professor-facing view (with the student's consent) of a student's growth.
- **Hands-free voice:** real-time conversation with Sensei.
- **Spaced review:** turning weaknesses into short review sessions at the right time, until they become strengths.
