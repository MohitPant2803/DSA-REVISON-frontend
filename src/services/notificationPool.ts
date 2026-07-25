export interface NotificationTemplate {
  title: string;
  body: string;
  persona: 'friend' | 'mentor' | 'coach' | 'future' | 'roast' | 'pattern';
}

export const BREAKUP_MESSAGE = {
  title: "This is goodbye. For now.",
  body: "We sent you reminders all week. You ignored every single one. This is where we stop. But we'll leave the light on — open when you're ready. 💔"
};

export const DSA_REMINDER_POOL: NotificationTemplate[] = [
  // 😂 Best Friend (35%)
  { title: "Your future self asked us to text you.", body: "They said something about regretting not revising today.", persona: "friend" },
  { title: "Instagram is still there.", body: "We checked. It's not going anywhere. Your momentum is, though.", persona: "friend" },
  { title: "You've spent longer deciding than revising.", body: "The hardest part is over — you already care. Just open.", persona: "friend" },
  { title: "Your Notes are taking this personally.", body: "They've been sitting there untouched. A little attention goes a long way.", persona: "friend" },
  { title: "I'll start tomorrow.", body: "We almost believed it this time. Almost.", persona: "friend" },
  { title: "This notification worked harder than you today.", body: "It traveled through servers, APIs, and OS queues just to reach you. The least you can do is tap.", persona: "friend" },
  { title: "Today's excuse has entered the chat.", body: "Let's kick it out before it gets comfortable.", persona: "friend" },
  { title: "Your brain ordered consistency.", body: "We're just the delivery service. Open up.", persona: "friend" },
  { title: "Stop ghosting your goals.", body: "They've been texting. You've been leaving them on read.", persona: "friend" },
  { title: "Motivation is running late.", body: "Don't wait for it. Start without it.", persona: "friend" },
  { title: "Five more reels... or five minutes for yourself?", body: "One of these will actually help you sleep better tonight.", persona: "friend" },
  { title: "This won't be on the exam.", body: "But the habits you build right now? Those definitely will.", persona: "friend" },
  { title: "Your chair misses you.", body: "Your brain is ready for a win. Let's give it one.", persona: "friend" },
  { title: "Hey... got two minutes?", body: "That's genuinely all we need. Two minutes.", persona: "friend" },
  { title: "Quick favor?", body: "Open the app. Revise one card. Close it. That's the whole favor.", persona: "friend" },
  { title: "We saved your spot.", body: "You left off right in the middle of a flow. Let's finish that thought.", persona: "friend" },
  { title: "Just checking in.", body: "No pressure, no guilt. Just a friendly nudge.", persona: "friend" },
  { title: "Ready when you are.", body: "The app is loaded. Your cards are waiting. No rush.", persona: "friend" },
  { title: "We thought of you.", body: "Specifically, we thought: \"They'd feel great after a quick session.\"", persona: "friend" },
  { title: "Come back for a bit?", body: "Even two minutes counts. Seriously.", persona: "friend" },
  { title: "Long time no see.", body: "Your revision cards have been asking about you.", persona: "friend" },
  { title: "We've been waiting.", body: "Patiently. But still waiting.", persona: "friend" },
  { title: "You know what to do.", body: "One tap. One card. One small win.", persona: "friend" },

  // 🌱 Mentor (25%)
  { title: "Five minutes now.", body: "Thank yourself later. That's the whole deal.", persona: "mentor" },
  { title: "The hardest part is opening the app.", body: "Everything after that first tap is easy. We promise.", persona: "mentor" },
  { title: "Tiny effort. Massive difference.", body: "You don't need an hour. You need five focused minutes.", persona: "mentor" },
  { title: "Don't overthink it.", body: "Just begin. The rest takes care of itself.", persona: "mentor" },
  { title: "One tap.", body: "That's today's entire mission. Nothing more.", persona: "mentor" },
  { title: "Small sessions. Big confidence.", body: "Every quick review stacks up quietly in the background.", persona: "mentor" },
  { title: "You don't need motivation.", body: "You need momentum. And momentum starts with one tap.", persona: "mentor" },
  { title: "Take a quiet pause.", body: "Step away from the noise. Give your brain something meaningful.", persona: "mentor" },
  { title: "No pressure. Just begin.", body: "You don't have to finish anything. Just start something.", persona: "mentor" },
  { title: "Small steps still move you forward.", body: "Even the tiniest session today puts you ahead of yesterday.", persona: "mentor" },
  { title: "Start before you feel ready.", body: "Readiness is a feeling that arrives after you begin, not before.", persona: "mentor" },
  { title: "Your mind deserves five peaceful minutes.", body: "Trade the chaos for a calm, focused session.", persona: "mentor" },
  { title: "Breathe. Begin. That's enough.", body: "No massive goals today. Just presence.", persona: "mentor" },
  { title: "Be kind to your future self.", body: "Give them the gift of a quick revision today.", persona: "mentor" },
  { title: "Reset your focus.", body: "One short session can clear the mental fog.", persona: "mentor" },
  { title: "One calm moment can change your day.", body: "Let this be that moment.", persona: "mentor" },
  { title: "Slow progress is still progress.", body: "You're further along than you think. Keep going.", persona: "mentor" },
  { title: "You don't need a massive block of time.", body: "Just a tiny window of focus. That's all it takes.", persona: "mentor" },
  { title: "You don't need to be perfect today.", body: "Just be present. That's more than enough.", persona: "mentor" },
  { title: "Break the loop.", body: "One tap is all it takes to snap out of the scroll cycle.", persona: "mentor" },
  { title: "You're one small session away from feeling better.", body: "Not tomorrow. Right now.", persona: "mentor" },

  // 🎯 Coach (20%)
  { title: "Bet you can't stop after one.", body: "Open ReeWise. Do one revision. Try to walk away. We dare you.", persona: "coach" },
  { title: "Give us three minutes.", body: "That's all. Three minutes. You'll feel the difference.", persona: "coach" },
  { title: "Ready for today's tiny win?", body: "It's sitting inside the app, waiting for you.", persona: "coach" },
  { title: "Prove yourself wrong.", body: "You think you don't have time. One tap says otherwise.", persona: "coach" },
  { title: "Leave after one session if you want.", body: "But we both know you won't.", persona: "coach" },
  { title: "Can you keep one promise today?", body: "Just one. Open. Revise. Done.", persona: "coach" },
  { title: "Make today count.", body: "Even a little. Even one card. It all adds up.", persona: "coach" },
  { title: "Your move.", body: "The app is ready. The cards are loaded. Ball's in your court.", persona: "coach" },
  { title: "This takes less time than choosing a movie.", body: "And it's way more productive.", persona: "coach" },
  { title: "Challenge accepted?", body: "One session. Right now. Let's see what you've got.", persona: "coach" },
  { title: "Keep the promise you made to yourself.", body: "The one where you said you'd stay consistent this time.", persona: "coach" },
  { title: "Success loves consistency more than intensity.", body: "Show up today. That's the whole strategy.", persona: "coach" },
  { title: "You don't have to do everything.", body: "Just something. Anything. One card is enough.", persona: "coach" },
  { title: "One good decision can change the whole day.", body: "This notification is that decision knocking.", persona: "coach" },
  { title: "Consistency is the boring secret.", body: "Behind every success you admire is someone who showed up daily.", persona: "coach" },
  { title: "Tiny progress beats perfect plans.", body: "Stop planning the perfect session. Just get one in.", persona: "coach" },

  // ✨ Future You (15%)
  { title: "Six months from now starts today.", body: "Every session you skip delays the person you're becoming.", persona: "future" },
  { title: "Build a future you'll thank yourself for.", body: "It starts with five minutes right now.", persona: "future" },
  { title: "Future you remembers today.", body: "Make it a day worth remembering.", persona: "future" },
  { title: "Confidence is earned quietly.", body: "In small sessions. In daily habits. In moments like this one.", persona: "future" },
  { title: "Today's effort becomes tomorrow's confidence.", body: "You're investing in yourself every time you open the app.", persona: "future" },
  { title: "You'll never regret showing up.", body: "Not once. Not ever.", persona: "future" },
  { title: "Make your future self slightly proud.", body: "Not massively. Just slightly. That's all it takes today.", persona: "future" },
  { title: "Every small session compounds.", body: "Like interest. Quietly building in the background.", persona: "future" },
  { title: "You're building something bigger than today.", body: "One session at a time. One day at a time.", persona: "future" },
  { title: "This version of you won't last forever.", body: "The next version is shaped by what you do right now.", persona: "future" },
  { title: "Future you is quietly checking off sessions.", body: "Let's add one more to the list.", persona: "future" },
  { title: "The work you do today creates the version of you that gets the job.", body: "No shortcut. Just showing up.", persona: "future" },
  { title: "You're building a habit, not just revising.", body: "The revision is a bonus. The habit is the real win.", persona: "future" },
  { title: "You'll be glad you opened the app today.", body: "Six months from now, this is the moment that mattered.", persona: "future" },
  { title: "Every expert once started exactly here.", body: "Sitting where you're sitting. Feeling what you're feeling. They just tapped \"open\".", persona: "future" },

  // 😈 Roast Mode (5%)
  { title: "Continue scrolling.", body: "Your competition appreciates it.", persona: "roast" },
  { title: "Ah yes... tomorrow.", body: "The most productive day of the year. It never actually arrives, though.", persona: "roast" },
  { title: "Ignore this.", body: "We'll pretend we didn't notice. Again.", persona: "roast" },
  { title: "Bold strategy.", body: "Let's see how \"not revising\" plays out at the interview.", persona: "roast" },
  { title: "We brought revision. You brought excuses.", body: "Guess which one is more useful.", persona: "roast" },
  { title: "Don't let us interrupt your \"quick break\".", body: "The one that started three hours ago.", persona: "roast" },
  { title: "Confidence doesn't download itself.", body: "You actually have to earn it. Sorry.", persona: "roast" },
  { title: "The offer letter hasn't forgotten you.", body: "But it's starting to wonder if you've forgotten it.", persona: "roast" },
  { title: "Your goals called.", body: "They miss you. They also said you've been avoiding them.", persona: "roast" },
  { title: "Procrastination is getting a little too comfortable.", body: "Time to evict it.", persona: "roast" },

  // 🧠 Pattern Breaks (5%)
  { title: "Wait.", body: "Did you revise today? Be honest.", persona: "pattern" },
  { title: "Plot twist.", body: "The person who gets the offer is the one who revised today.", persona: "pattern" },
  { title: "Quick question.", body: "When was the last time you opened ReeWise? Exactly.", persona: "pattern" },
  { title: "Be honest.", body: "Are you actually going to revise today, or are we doing this again tomorrow?", persona: "pattern" },
  { title: "Before you scroll...", body: "Give your brain five minutes of something useful first. Then scroll guilt-free.", persona: "pattern" }
];
