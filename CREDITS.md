# Credits

**Tweepcred Manager** is a unification of two existing community projects into a
single tabbed control panel. It does not replace their authors' work — it bundles
their engines, shares their plumbing, and wires them to one UI around the common
goal of managing X's "tweepcred" reputation score.

## Unfollow engine

- **Original author:** Shayan Taherkhani — <https://shayantaherkhani.ir> · [@tah3rkhani](https://twitter.com/tah3rkhani)
- **Source projects:** *Twitter/X Mass Unfollow* (`unfollow.js`) and its continuous
  variant (`unfollow-continuous.js`).
- **What was reused:** the virtualized-list walker, mutual detection (`isMutual`),
  private-account detection (`isPrivate`), the unfollow-button locator
  (`findUnfollowButton`), confirmation handling, and the batch/cooldown loop.

## Cleanup engine (TweetXer)

- **Original authors:** Luca Hammer and contributors — Luca, dbort, pReya,
  Micolithe, STrRedWolf. Support the original author:
  <https://www.buymeacoffee.com/lucahammer>
- **Source project:** *TweetXer* (`tweetXer.js`), v0.9.4.
- **What was reused:** the data-export file parsing, GraphQL/REST deletion calls
  (`DeleteTweet`, `UnfavoriteTweet`, DM deletion, conversation deletion), bookmark
  export, the spare-by-likes / spare-recent-days filters, live like-count lookups,
  auto-pause, and the slow-delete-from-profile flow.
- **Upstream lineage:** XHR interception inspired by
  [ttodua/Tamper-Request-Javascript-Tool](https://github.com/ttodua/Tamper-Request-Javascript-Tool);
  faster deletion inspired by
  [Lyfhael/DeleteTweets](https://github.com/Lyfhael/DeleteTweets).

## Unification

- Merged, the Dashboard tweepcred estimator, the audit/whitelist additions, and
  this packaging by **HyperboreanSlug**.

## Licensing note

The combined project is distributed under the [MIT License](LICENSE). The bundled
engines retain their original authorship and credit. If you are one of the original
authors and would like attribution adjusted, please open an issue.
