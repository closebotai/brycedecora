---
title: Why we decided to start offering done for you ai at CloseBot
seoTitle: Why We Build the AI Agent For You
description: The hard part of an AI setter is not the model. It is the hundred configuration decisions around it, and a nicer editor does not make those easier.
pubDate: 2026-09-30
tags:
  - product
  - operations
relatedArticles:
  - when-an-ai-appointment-setter-is-the-wrong-tool
---

For a long time my instinct as a software person was that every workflow
problem is a me problem. If customers are struggling to configure the thing,
build a better builder. Better defaults, better editor, better templates. Never ending.

That instinct was wrong, and it took watching a lot of accounts to accept
it. The hardest part of commanding your AI appointment setter isn't always in the UI... it's that people have no freaking clue what they want in the first place. Eventually we also released our [partners](https://closebot.com/) who can build for people who need help and are willing to pay for it, but even then a lot of people refused to pay 3rd parties.

We still wanted these people to win, and they were willing to pay for it.

I co-founded [CloseBot](https://closebot.com/), so this is a note about our own
product decision rather than a neutral survey.

## What actually blocks a working setup?

It's not usually a lack of features.  It's a lack of knowledge about how to run a business at all.

What counts as qualified, stated precisely enough that a machine can apply it
consistently? When should the AI follow up and when should it shut up?  Do we need to collect timezone before booking?  If they are likely in a different timezone... DUH.  That's the stuff people don't think about.  And they don't want to think about it.

Every one of those is a business decision that better UI won't solve. It's the same reason why people who find the most success building out their CloseBot themselves are also great with employee SOPs (standard operating procedures) and the ones who crash and burn are the same ones who have employee problems.

## Why better UI doesn't fix this... and neither does AI help

UI is a tool for users to carry out ideas they've already thought of.  Not a place to teach you how to run a business.

Using AI as a crutch can make this even worse.  Asking it "should I have a different AI Agent for operations, support and customer onboarding or should it all be rolled into one?"

The mere fact that you started off the conversation introducing the idea of multiple bots will make the AI prone to suggest that as a solution, even though it's a piss-poor solution (always start with one AI Agent instead of breaking things up 🤦‍♂️)

We kept shipping builder improvements and kept seeing the same shape of churn:
accounts that were configured, launched, technically functioning, and not
producing appointments, because the qualification logic was something the
customer had guessed at.  Something that wouldn't have worked even if a super qualified person was following the SOP.

## What we do for these people now instead

Templates are one thing, producing the same problem.  We know templates always need modified to match exactly what you want, some of our users do not... "I used your template and it was terrible!"... "Well sir/ma'am, I see you made no edits to this template for home services, and it's set up to residential solar, you sell commercial solar.  See why that would need a tiny bit of tweaking? No? Alrighty then."

We took it a step further offering our trained partners, but we also started to build it ourselves in house when we got pushback that people didn't want a third party builder.  So, we build it.  We build it using the pattern we have seen work in that vertical, and hand it over once it is producing conversations the customer has reviewed.

A kickoff call to extract the qualification criteria and routing, then we configure and connect everything, then the customer reviews real test conversations and requests revisions, then they approve launch before a single real lead is touched. About ten days. The details and current pricing are on the [done-for-you page](https://closebot.com/done-for-you/).

The part that matters is step one and step four. Step one is where someone who
has seen a few hundred of these asks the questions the customer had not thought
to answer. Step four is where the customer sees what their own criteria
actually produce, in a transcript, before it runs on real people.  Usually the reaction is, "oh the AI is asking far too many questions..."

"Well, you said that's what you wanted.  What can we take out entirely or what questions can we have the AI ask after scheduling the appointment?"

That review loop catches more problems than any amount of upfront specification, because people are far better at reacting to a concrete conversation than at describing one in advance.

## The uncomfortable part of this decision

Done-for-you is a services motion inside a software company, and services do
not scale the way software does. Every install consumes real hours from people
who could be building. That is a genuine cost and I do not want to pretend it
is elegant.

We do it because the alternative is worse for everyone: customers who bought
software, configured it on a guess, got mediocre results, and concluded that
the category does not work. That outcome is bad for them, bad for us, and it is
what most of the churn in this market actually is.

We don't even charge extra for this right now really.  We just make people who select done for you commit to a year of CloseBot.  Seems like a real no brainer to me.

## What I would tell you if you were not buying from me

If you have an operator who already knows exactly what qualified means for your
business, and the patience to iterate on transcripts for a few weeks, build it
yourself.  CloseBot freaking rocks.  We use it ourselves.

If you do not have that person, buying the configuration is the thing worth
paying for. The software is close to a commodity. The hundred decisions are
not.
