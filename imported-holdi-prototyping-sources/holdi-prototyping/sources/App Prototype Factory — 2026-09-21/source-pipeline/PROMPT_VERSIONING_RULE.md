# Prompt versioning and comparison rule

1. Keep only the current prompt files in the active project folder.
2. Before changing an existing prompt, copy its current version into `Архив/`.
3. Archive filename format: `<prompt name> — YYYY-MM-DD HH-MM — vN.md`.
4. Do not read `Архив/` during normal product/design work unless a comparison or rollback is explicitly requested.
5. After the archive snapshot is saved, update the active prompt file.
6. A complete prompt shown to the user as the current version must be saved to its active file in the same edit. If text is only an unsaved proposal, label it explicitly and never treat it as the `old` source for a later comparison. If the user edits a complete prompt that was shown but not saved, first preserve that exact shown text as the old snapshot, then apply the requested changes.
7. After creating or editing any prompt, run an editorial pass over its complete text before treating it as final:
   - remove semantic repetitions; keep each fact or instruction in one place, repeating it only when the repetition adds a new condition, relationship or consequence;
   - remove lyrical wording, preambles, explanations, examples and warnings that do not change the agent’s action, decision or required output;
   - remove empty sections and mirrored prohibitions that merely restate an existing rule;
   - re-read the shortened prompt and restore any unique requirement accidentally removed. Only after this check save the final prompt and prepare its comparison.
8. Before editing a prompt, freeze the exact full contents of the active file as `old`. After editing, read the exact full contents of the resulting active file as `new`. Never reconstruct either side from memory, conversation summaries, selected quotations or manually written descriptions of the changes.
9. `comparison.json` must contain the complete verbatim `old` and `new` texts for every prompt changed in the edit. When several files changed, concatenate every complete file using stable `# ФАЙЛ: <name>` boundaries. Never put excerpts, shortened versions, synthetic fragments or hand-authored summaries into `oldText` or `newText`.
10. Generate the visible comparison mechanically from those complete texts. Render the complete old and new versions without hiding unchanged content; highlight additions and removals inside them. Do not manually choose which text to display.
11. Before publication, run an integrity check:
   - after the stable file boundary, every complete file block in `oldText` equals its selected archive snapshot;
   - after the stable file boundary, every complete file block in `newText` equals its current active file;
   - every prompt changed in the edit is present on both sides;
   - no prompt not changed in the edit is included;
   - the visible highlights come from the full diff rather than a prepared summary.
12. If the exact old version cannot be recovered, do not fabricate a comparison. Stop, report which source is missing and either recover the exact version or clearly state that an exact comparison is unavailable.
13. After every change to one or more prompts, automatically prepare and publish a comparison of the exact latest relevant archived snapshot (`old`) with the exact current active prompt (`new`). Include every prompt changed in that edit and provide the permanent external link in the final reply without waiting for a separate comparison request.
14. Commands **«Покажи сравнение»**, **«Открой сравнение»** and equivalent requests mean: show the comparison prepared after the latest prompt edit, unless the user specifies other versions. If it is not current, rebuild it from the exact latest relevant archived snapshot and active prompt.
15. Update `Tools/comparison.html` using `Tools/Prompt Compare — template.html`, then publish the comparison to the SAME permanent page below. Do not create another Site or give only a local file link.
16. The page contains only prompt names and the complete old and new texts under short «Было / Стало» labels. Keep unchanged text visible and highlight removed and added wording. Show the versions side by side on wide screens and one after another on narrow screens, without horizontal scrolling. Do not add a toolbar, buttons, counters, line numbers, cards, legends or sticky panels. Pre-render all comparison content so it is visible without JavaScript.
17. If the archived snapshot and current file are identical, say so explicitly instead of inventing a difference.
18. Keep the page permanent: no expiration date or timer. Each comparison replaces its content at the same URL. Preserve owner-only access unless the user asks to change it.
19. After EVERY request to show or open a comparison, automatically provide the external HTTPS link in the final reply as a clickable Markdown link, ready to copy into Safari, Chrome or another external browser. Updating the page alone is not enough. Do not wait for a follow-up request for the link, ask whether to publish, or substitute a sandbox link or embedded preview. If the requested comparison is already published and current, return its existing external link immediately. If publication fails, say so instead of claiming the link contains the new comparison.

## Permanent comparison page

- URL: https://prompt-compare-sep19-be2a03.i999252577.chatgpt.site
- Existing Sites project_id: `appgprj_6aae2c058360819181603f6b8ee77874`
- Use sites-building/sites-hosting to update and publish this existing Site. Reuse its checkout when available; otherwise obtain its source credential and clone the existing repository. Never create a replacement Site.
- In the Site source, populate `comparison.json` programmatically from the exact full old/new files; never compose it from manually selected fragments. The build generates the complete comparison and its permanent page. Follow the source README and keep the Library template/current comparison consistent with the published page.
- Always return the same permanent external URL after successful publication or confirmation that the requested comparison is already current.
