---
"next-smart-router": patch
---

Sticky query params no longer drop repeated keys on the target. Carrying
`locale` onto `../members?tag=a&tag=b` used to produce `?locale=fr&tag=b`;
it now keeps both `tag` values. Fixed in `nav.push`, `<SmartLink>` and
`createRouter().withSticky`, which now share one implementation.
