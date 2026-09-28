# Why I Built Pi Rain Radar

Before I take the dog out, I usually want to know one thing:

**Am I going to get wet?**

Not what the weather will be this afternoon. Not what five different forecast models think might happen later. I normally care about the next hour or two.

Is that patch of rain actually heading towards me? Is it likely to miss? Is it worth taking an umbrella for a ten-minute school walk? Do I need a jacket?

For years I answered those questions by opening weather apps on my phone. Eventually I realised that the information I wanted should not be hidden behind an app at all.

It should simply be there, beside the front door, at the exact moment I need it.

That small idea became Pi Rain Radar.

## The project that stayed in my head

The story really starts several years earlier.

Around 2020 I discovered [Eric Lewin's Pi Weather Station](https://github.com/elewin/pi-weather-station). I loved it. It was exactly the sort of Raspberry Pi project that appealed to me: simple hardware, a screen, useful information, one clear purpose.

I installed it on a Raspberry Pi and kept it running.

I am technical, but I am not a Linux person, and I remember the setup taking me a bit of time. The instructions were there and I got it working, but this was before I had an AI assistant I could simply ask when I hit something unfamiliar. There was a fair amount of Googling and figuring things out.

Once it was running, though, I really enjoyed it.

At that time I did not yet have [Home Assistant](https://www.home-assistant.io/) collecting years of sensor history, so even simple weather trends were interesting to watch. But the part that stayed with me most was the rain.

I realised I preferred seeing what the weather had actually been doing and making my own short-term judgement from that.

If you can see a band of rain moving across a map, you can often make a surprisingly useful call yourself. It will not always be right, but that is part of the fun. I would rather look at the evidence and decide than blindly accept a forecast and blame somebody else when it is wrong.

Eric's project did not immediately inspire me to build my own. I was simply a user who liked it.

But the idea of a dedicated, glanceable weather screen stayed in my head.

## Then weather information became everywhere — and somehow less convenient

Years later we moved house, and by then I had started building out Home Assistant properly.

I became much more interested in collecting actual data: temperatures, trends, sensor history, graphs, what happened yesterday, what changed during the week.

I also used dedicated weather applications heavily.

[Windy](https://www.windy.com/) became one of my favourites. I have used the premium version and I still think it is an extraordinary application. I occasionally fly RC planes, so wind visualisation is particularly interesting to me. The number of layers and the amount of information available are incredible.

[RainViewer](https://www.rainviewer.com/) was another favourite, especially for rain radar. I also used a custom RainViewer card inside Home Assistant.

At one point I probably had five or seven weather applications on my phone, comparing different views and sources.

The irony was that I had more weather information than ever, but the most useful part of it was still hidden behind interaction.

I had to remember to pick up the phone, unlock it, open an app, wait for it to load, get to the right map and look.

That is trivial once.

It becomes mildly annoying when you do it every time you are about to walk the dog.

It also meant the information was mainly mine. My wife and children were not going to reproduce my particular collection of apps and dashboards just to decide whether they needed an umbrella.

That was the real problem.

The question was not:

> How do I build a better weather application?

It was:

> How do I make the information available with almost no interaction at the moment somebody needs it?

The answer was obvious once I saw it.

Put a screen next to the front door.

## Why I didn't just use Home Assistant

The first implementation seemed straightforward.

I already had a RainViewer card in Home Assistant. I could put Raspberry Pi OS on a Pi, connect a display, open Home Assistant in a browser and leave the radar on screen.

Technically, that would have worked perfectly well.

But it felt wrong.

That surprised me because my normal instinct is to integrate everything. I like systems talking to each other. I like Home Assistant sitting at the centre of the smart home.

For this one device, though, I wanted the opposite.

I wanted an appliance.

The screen by the door had one job. It should boot, show the weather and continue doing that regardless of whatever else I happened to be doing with Home Assistant.

If I was upgrading HA, rebuilding something, restarting services, experimenting with integrations or fixing an unrelated problem, the radar should not care.

My family should not need to know that Home Assistant even exists for the screen to work.

That independence became one of the defining ideas of the project.

The device should be self-contained, boringly reliable and dedicated to its purpose.

## Looking for something that already existed

Before building anything, I looked around.

Eric's project kept appearing — in articles, videos, guides and Raspberry Pi discussions. It had clearly become a reference point for this type of build.

There were other weather dashboards too, including much heavier ones, but I could not find quite what I wanted.

My requirements were actually very small at the beginning:

- a lightweight application;
- comfortable on modest Raspberry Pi hardware;
- recent animated rain radar;
- simple controls;
- a clean screen that could stay on permanently;
- enough recent history to understand movement.

I was not planning the application Pi Rain Radar eventually became.

I just wanted to see the rain.

And at almost exactly the same time, I was experimenting with something else.

[Codex](https://openai.com/codex/).

## The implementation barrier disappears

I had already started using Codex cautiously for server operations.

Previously, I used ChatGPT mainly as an adviser. I would ask how to configure something, read the answer and then go and do the work myself.

Codex changed that relationship.

I could ask an agent to investigate a server, understand a problem, make bounded changes and document what it had done.

I approached that slowly because I am an engineer and I am naturally security-minded. I wanted to understand how much autonomy I was comfortable giving an AI agent and under what conditions.

But I also knew Codex could write software.

That mattered because I am not a full-stack developer.

I can understand technical systems. I can troubleshoot. I can reason about architecture, security, failure, usability and whether something makes sense.

But I would never have sat down and independently written the whole frontend, backend, data storage, packaging and deployment stack required for a polished application.

Without AI, I probably would not have attempted Pi Rain Radar at all.

Hiring a developer for a personal weather display would make no sense. Spending months learning an entire development stack just to solve this one problem would not make much sense either.

I would probably have compromised.

Maybe I would have gone back to Eric's project. Maybe I would have put Home Assistant on the screen. Maybe I would simply have carried on opening RainViewer on my phone.

Instead I described what I wanted to Codex.

Modern.

Lightweight.

Simple.

As few unnecessary dependencies as possible.

And [Docker](https://www.docker.com/)ised.

I had only relatively recently discovered Docker myself and had become fascinated by the portability of it. The physical appliance I wanted happened to be a Raspberry Pi, but there was no good reason for the software itself to be unnecessarily tied to one machine.

Codex came back with an architecture that made the idea feel completely realistic.

That was the point where “I wish this existed” became “I can make this exist.”

## A weekend later, it existed

The first working version appeared extraordinarily quickly.

I sat down over roughly a Saturday and part of Sunday and already had something real.

I hesitate to call it a prototype because it was not something I intended to throw away. It was simply a very early version of the actual product.

There was a radar map.

There was a basic interface.

There was enough there for me to start using it and immediately discover what was missing.

One of the first discoveries was that one map was not enough.

If I zoomed closely into my local area, I could see exactly what was happening around the house. But the closer I zoomed, the more I lost the bigger weather system.

So the overview map appeared almost immediately.

The main map could answer:

> What is happening here?

The overview could answer:

> Where is it coming from?

That two-scale view became part of the core.

The early history system was simple too: images saved to disk with lightweight metadata. No elaborate database. No giant architecture.

It worked.

And once I knew it worked, I went and bought the Raspberry Pi and screen.

I did not buy a Pi and then search for something to do with it.

The software proved itself first.

The appliance had earned a physical place next to the door.

## Then the product started teaching me what it wanted to become

I did not have a big product roadmap.

I used it.

Then ideas appeared.

What if the current weather readings sat unobtrusively in the interface?

What if I added a short-term precipitation forecast — not as the answer, but as another signal?

What if I could see a camera image of the actual sky?

What if I added clouds?

Clouds turned out to be one of my favourite additions because they make the wider weather system much easier to read.

This became the development rhythm:

**build → use → notice → refine.**

I would live with the application, collect ideas, then sit down with Codex and work through another batch.

The important thing was that I no longer had to reject an idea simply because I did not personally know how to implement it.

The question became less:

> Do I know how to code this?

and more:

> Is this actually useful, and how should it behave?

That was a profound shift for me.

## The archive was almost an accidental discovery

Originally, I thought seven days of history would be plenty.

Pi Rain Radar was about Live. The archive was useful, but secondary.

Then I started replaying the captured data and discovered something I had not expected.

Radar data is not perfectly live.

A provider may publish a frame 15, 20 or sometimes 25 minutes after the observation itself. That delay is understandable: the underlying radar data has to be captured, processed, published through an API, discovered by Pi Rain Radar and downloaded.

The crucial part is the timestamp.

If a frame arrives 25 minutes late, Pi Rain Radar can still place it at the time when the observation actually happened.

In Live view, the newest edge of the timeline can therefore lag behind reality.

But later, once delayed observations have arrived, the historical timeline fills in much more accurately.

That turned out to be fascinating.

The camera made it even better.

My camera looks at the sky, so when I replay an old period I can watch rain and cloud layers moving across the map alongside images of what the sky actually looked like.

Sometimes the relationship is striking.

And if I manually scrub very quickly through a long period — perhaps an entire day in only a few seconds — the clouds become almost cinematic.

You see systems forming.

Stretching.

Merging.

Breaking apart.

Dissipating.

Rain cells evolving inside them.

I absolutely love watching it.

That was when I realised the archive was not merely a convenience.

It had become another major part of the application.

So the storage system evolved too. The early simple history mechanism was refactored around SQLite and proper indexing, and retention could become limited by available storage rather than an arbitrary seven-day idea.

The Pi can quietly continue doing its job by the door: collecting, storing and displaying Live weather.

If I want to explore the archive properly, I can open the same instance from a laptop or another device and let the client machine provide the richer interactive experience.

The little Pi does not need to become a workstation.

It can remain an appliance.

## Going public

After several private iterations I realised the project might be useful to other people.

That was a new experience for me.

I had Git repositories before, mostly private ones containing notes, documentation and technical material. I had never really published a proper software project of my own.

Pi Rain Radar became the first.

The public release history starts at v0.1.0, although the software had already gone through several private iterations before that.

Once I decided to publish it, the repository itself became part of the product.

I wanted somebody arriving with no knowledge of me to be able to understand what the application was, install it and use it.

And if they wanted to modify it, I wanted enough context there for them to do that too.

This also fitted the way I had already learned to work with AI.

I do not want chat history to be the memory of a project.

Chats disappear. Context changes. A future model may know nothing about the conversation that produced a particular decision.

So the repository should contain enough context for a fresh AI agent to enter later, orient itself and continue the work without privileged history.

That principle matters a lot to me:

**the repo, not the chat, is the memory of the project.**

It also happens to make the project easier for humans to understand.

## Making the easy installation actually easy

The first public versions exposed another bit of friction.

Docker made the project portable, but the earliest release flow still expected the user to build the image from source.

I looked at that and realised I was recreating the same sort of setup burden I remembered from years earlier.

So ready-built ARM64 and AMD64 images followed almost immediately.

That moved the project closer to what I actually wanted:

install Docker, pull the application, run it.

But even that was not the whole appliance experience.

A fresh Raspberry Pi still needs operating-system preparation. Docker has to be installed. The display may need rotating. Kiosk behaviour needs configuring. The machine needs updating and setting up properly.

So I eventually built a guided installer and a photographed walkthrough called the **Ludicrously Quick Start**.

The target user for that guide is, in a way, the person I used to be when I first installed Eric's project.

Curious.

Technical enough to follow instructions.

But not somebody who should have to become a Linux administrator just to get a rain display working.

My ideal flow is close to:

assemble the Pi, flash the card, connect to it, run one command, follow the prompts, and end up with the appliance.

That feels like the story coming full circle.

## I did not write the code

There is one part of this story I do not want to hide behind vague wording such as “AI-assisted development.”

I did not manually write Pi Rain Radar's code.

Codex did.

In fact, I have not even read most of the source code.

That sounds provocative, but it is simply the truth.

Does that mean I did not build the project?

It depends what we mean by build.

I do not claim authorship of the implementation in the traditional sense.

What I do claim is the idea, the purpose, the product direction, the constraints, the behaviour, the judgement and the refinement.

I know what problem I wanted solved.

I know how I want the appliance to behave.

I know what belongs on the screen and what does not.

I know when something feels cluttered.

I know when an interaction is wrong.

I know when one icon being slightly out of alignment bothers me enough to change it.

I know what failure behaviour I am comfortable with.

I know how much privilege a feature should have.

I know what I am prepared to accept before publishing a release.

The simplest way I can describe my role is:

**The ideas are where my work is.**

AI has become an extraordinary implementation engine.

For me, that means specialist implementation knowledge is no longer necessarily the admission ticket to attempting an idea.

That does not mean knowledge is irrelevant.

It means the order can change.

The idea can come first.

Then AI can help bridge the implementation gap.

## This is not a claim that every system should be built this way

I am very comfortable with this model for a project like Pi Rain Radar.

It is bounded.

I can observe what it does.

I use it myself.

I can test it.

Failure is recoverable.

Nobody's life depends on whether my radar animation is correct.

That matters.

The acceptable level of understanding should rise with the consequences of being wrong.

If I were responsible for a consequential enterprise system involving customer data, money, regulation, critical operations or safety, I would not consider “the AI generated it and it seems to work” an acceptable engineering standard.

I would still use AI heavily.

I would use it to write and review code, investigate problems, improve documentation, propose designs and accelerate engineering.

But the assurance, review and accountability around the result would need to match the risk.

For Pi Rain Radar, behavioural understanding and recoverability are enough for me.

For something more consequential, the bar would be much higher.

## I don't want to build myself another job

There is another principle behind the amount of documentation and automation in the project.

When I build something, I tend to go all in upfront because I do not want to create a recurring job for myself.

I have followed the same approach in my professional work for years.

A good system should continue delivering value when the person who created it is no longer hovering over it.

That is why I care about documentation, reproducibility, recovery and automation even in a home project.

Pi Rain Radar should eventually become boring infrastructure.

It boots.

It collects.

It stores.

It recovers.

It displays.

It keeps doing that.

I am happy to return to it because I have another idea or because I want to improve something.

I do not want to return because the thing needs babysitting.

That is also why the repository needs to be re-enterable by a future AI model that knows nothing about the chats that created it.

The goal is not perfect software.

The goal is the right solution, built in a way that does not create unnecessary work later.

## Then I discovered “vibe coding”

Only after I had already been working this way did I encounter the phrase “vibe coding.”

For a moment, it made me question what I had done.

Had I simply generated a lot of code because AI made it easy?

Was this one of those projects that looks impressive from the outside but is rubbish underneath?

Then I looked at what had actually happened.

Yes, the code was generated through prompts.

But the process had also accumulated automated tests, release candidates, upgrade checks, real hardware validation, documentation, reproducible development tooling and a lot of manual UI refinement.

The backend code may contain things an experienced developer would write differently.

The documentation may sometimes be more verbose than I would write myself.

There may be inefficiencies I have not seen yet.

That does not particularly trouble me.

If they cause a real problem, they can be improved.

I am not trying to prove that AI-generated code is secretly perfect software.

I am trying to solve a problem well.

Whether somebody calls me a vibe coder, developer, builder or none of those things is not especially important to me.

The appliance works.

It does the job I wanted.

And I enjoy using it.

## The weather still makes the decision mine

Despite everything else the project has become, the part I like most is still the original one.

Pi Rain Radar does not tell me:

> Take an umbrella.

It gives me evidence.

Recent rain.

Cloud movement.

Current readings.

A short-term forecast if I want it.

A view of the sky.

Then I make the call.

Sometimes I will get it wrong.

That is fine.

It is my mistake.

Perhaps I will learn something from it and read the next system better.

There is something satisfying about that.

A sophisticated AI helped me build a tool whose philosophy is, in a way, not to surrender judgement to sophisticated prediction.

Use the tools.

Use the data.

Then decide.

## Public value was not required — but I am glad when it travels

Pi Rain Radar was already successful before anybody else cared about it.

If nobody had starred the repository, nobody had written about it and nobody else had installed it, the screen would still be next to my front door doing exactly what I built it to do.

I would still use it.

I would still love watching the clouds.

I would still be proud of it.

But I would be lying if I said outside interest means nothing.

I do not particularly need recognition for having made it.

What I want is to know that the value can travel.

I experience the project as something genuinely useful and, at times, genuinely beautiful.

There is a natural urge to point at something like that and say:

> You should try this.

That is why I cared about the installer and documentation.

Not because I needed them myself.

Because I wanted the distance between somebody discovering Pi Rain Radar and somebody actually experiencing it to be as small as possible.

## Putting something back

That brings the story back to Eric.

Years ago, somebody put an open Raspberry Pi weather project into the world.

I found it.

I used it.

It gave me something valuable.

It stayed in my head long enough to become part of the chain that eventually produced Pi Rain Radar.

That is why I credit Eric in the repository. It is simply the truthful history of the project.

Now Pi Rain Radar is public too.

It is MIT licensed. People can use it, change it, fork it and take it somewhere I never imagined.

If somebody eventually creates something much better from it and never gives me personal credit, I am genuinely fine with that.

Credit is not what interests me most.

I would just love to know what happened.

If some magical assistant could appear five years from now and say:

> Alex, look what somebody did with that thing you started.

I would find that fascinating.

Maybe somebody turns the idea into a beautiful physical appliance.

Maybe somebody uses it in a school.

Maybe somebody takes one tiny part of it and builds something completely different.

Maybe another person who is not a software developer looks at the project and thinks:

> Perhaps I can build my idea too.

That would be enough.

I do not need the credit.

I would just love to see where the idea goes.

## And for now, I still just look at the screen

For all the architecture, Docker images, AI agents, archive indexing, documentation and philosophical questions, the actual moment of use is still almost absurdly simple.

I am about to leave the house.

I glance at the screen.

I watch where the rain is moving.

I look at the clouds.

I make a decision.

Umbrella or no umbrella.

Then I open the door and go.

That is why Pi Rain Radar exists.
