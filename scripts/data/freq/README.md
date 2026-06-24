# Indonesian frequency snapshot

`id-frequency.json` — a pinned, in-repo snapshot of the top-30000 Indonesian word
forms ranked by corpus frequency. `words[i]` has rank `i + 1`.

## Provenance & licence

Derived from **[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)**,
`content/2018/id/id_50k.txt` (OpenSubtitles2018 corpus, via the opensubtitles.org
frequency dumps). Licensed **CC BY-SA 4.0** — attribution required; a derivative
snapshot must keep the same licence.

Same status as the kaikki etymology snapshot (`../kaikki/`): pinned for
reproducible, offline builds. **Commercial-use diligence is needed if the
monetization direction ships** (CC BY-SA share-alike).

## Why it exists

The ADR-0020 morphology proposer derives affixed forms and validates them against
kaikki attestation. But hyper-productive Indonesian suffixes/confixes (`-kan`,
`-an`, `meN-…-i`, `di-…-i`) over-generate: kaikki attests even rare/mechanical
derivations (`membanyaki`, `menahui`), and the proposer can only rank by the
*root's* frequency, not the derived form's. This snapshot supplies a **derived-form
frequency signal**: a derived form is accepted only if it is a real, frequent word
(present in this list), and pools are ranked by that frequency. The junk forms are
absent from any frequency corpus, so the gate removes them deterministically.

## Regenerating

```
curl -sL https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/id/id_50k.txt -o /tmp/id_freq.txt
# take the first 30000 distinct lowercase words; words[i] = rank i+1
```
