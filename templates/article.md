---
# ARTICLE TEMPLATE
#
# Copy to src/content/articles/<slug>.md and delete the instruction comments.
# The filename becomes the URL: /writing/<slug>/
#
# Lives outside src/content/ on purpose — anything in the content directory is
# built and published, and a template is neither.

# The visible <h1>. 3–80 chars. Write the claim, not the topic:
#   "SEO guardrails that fail the build"   not   "Thoughts on SEO"
title: ''

# The <title> in search results. 10–60 chars. Omit to reuse `title`.
# Set it when the H1 reads better as a sentence than as a search-result label.
seoTitle: ''

# The meta description AND the feed summary. 50–160 chars, enforced.
#
# Write it as a complete, standalone answer to the question the title raises —
# not a teaser. It is frequently the only sentence a person or a model reads
# before deciding whether to open the page. "Learn more about X" wastes it.
description: ''

pubDate: YYYY-MM-DD

# Set when you make a SUBSTANTIVE revision — new information, corrected claim,
# changed recommendation. Not for typos.
#
# This drives `dateModified` in the Article schema and a visible "Updated" line.
# Ageing content loses ground fast in AI-generated answers; a real revision date
# on genuinely revised content is the honest way to hold it. Backdating or
# touching the date without changing the content is the dishonest way, and it
# is the kind of thing that eventually gets caught.
updatedDate:

# Lowercase, hyphenated. Shown on the article.
# Reuse existing tags rather than inventing near-duplicates — `ai-automation`
# and `ai_automation` and `AI automation` are three dead ends.
tags: []

# Slugs of other articles, validated at build time — a broken reference fails
# the build rather than shipping a 404. This is how internal linking stays a
# property of the content model instead of something each page invents.
relatedArticles: []

# Optional. Both are required together; a cover without alt fails the build.
# cover: ../../assets/<file>.jpg
# coverAlt: 'Describe what the image shows.'
---

<!--
STRUCTURE — why it is shaped this way

Two findings drive this, and only one of them is about search engines:

  1. Of 100 sampled Google AI Overview citations, 55% came from the first 30%
     of the source page. Whatever the page is actually for should be near the
     top, not built up to.
  2. Retrieval systems chunk a page and rank the chunks. A section that only
     makes sense after reading the three sections above it retrieves badly and
     gets quoted out of context when it retrieves at all.

Both point the same way, and it is the same way good technical writing already
points: answer first, then support. Google's own guidance is explicit that
there are no special AI optimizations — this is not a trick, it is structure.

Delete this comment block when you write.
-->

Open by answering the question in the title. One or two paragraphs, no throat
clearing, no "in today's landscape." If someone read only this and left, they
should have gotten the answer — the rest of the page is evidence and nuance for
people who need it.

## Make headings the questions a reader would actually ask

Not "Background" or "Overview." A heading like "Why FAQ schema stopped being
worth implementing" states what the section answers, which makes the section a
self-contained unit for a reader skimming and for anything chunking the page.

Each section should survive being read on its own. Define terms on first use
rather than assuming the paragraph above. Prefer specifics that can be checked —
versions, dates, measurements, named things — over adjectives. "Deprecated in
May 2026" is citable; "recently deprecated" is not.

## Keep paragraphs to one idea

Short paragraphs are not a concession to short attention spans. They are how you
make a passage quotable without surrounding context, which is what determines
whether an excerpt of your page is any good.

## Say what you are not claiming

The limits of an argument are part of it. A page that marks its own boundaries
is more useful and more trustworthy than one that overreaches, and it is the
part most competing pages skip.

## What to do about it

End with something actionable, or with the honest statement that the answer is
"it depends, and here is what it depends on." Do not end with a summary of what
was already said.
