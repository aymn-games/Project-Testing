/*
 * agp-apple-emoji.js
 * يوحّد شكل الإيموجي على كل الأجهزة: يستبدل أي إيموجي نصي في الصفحة بصورة
 * إيموجي أبل (emoji-datasource-apple عبر jsDelivr)، بما فيها المحتوى الذي
 * تضيفه الألعاب لاحقًا (MutationObserver).
 * - الصورة بحجم 1em فتتبع font-size العنصر الأب تلقائيًا.
 * - alt = الإيموجي الأصلي، ولو فشل تحميل الصورة يرجع النص كما كان.
 * - لا يلمس: input/textarea/select/option/script/style/contenteditable و<title>.
 */
(function () {
    'use strict';
    if (window.__agpAppleEmoji) return;
    window.__agpAppleEmoji = true;

    var CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/';

    var SEQ_RE = /(?:\p{Regional_Indicator}{2})|(?:[#*0-9]️?⃣)|(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;
    var PRESENTATION_RE = /\p{Emoji_Presentation}/u;
    var QUICK_RE = /[©®‼-㊙\u{1F000}-\u{1FAFF}⃣]/u;

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, TITLE: 1, svg: 1, SVG: 1, CODE: 1, PRE: 1 };

    function isModifier(cp) { return cp >= 0x1F3FB && cp <= 0x1F3FF; }

    // يبني اسم الملف بنفس قاعدة emoji-datasource: يضاف fe0f بعد كل رمز
    // ليس له عرض إيموجي افتراضي، إلا إذا تبعه لون بشرة.
    function fileName(seq) {
        var cps = [];
        for (var ch of seq) {
            var cp = ch.codePointAt(0);
            if (cp !== 0xFE0F) cps.push(cp);
        }
        var out = [];
        for (var i = 0; i < cps.length; i++) {
            var c = cps[i];
            out.push(c.toString(16).padStart(4, '0'));
            var special = c === 0x200D || c === 0x20E3 || isModifier(c) ||
                (c >= 0x1F1E6 && c <= 0x1F1FF) || (c >= 0xE0020 && c <= 0xE007F);
            if (!special && !PRESENTATION_RE.test(String.fromCodePoint(c)) && !isModifier(cps[i + 1])) {
                out.push('fe0f');
            }
        }
        return out.join('-') + '.png';
    }

    // يستبعد الرموز التي تظهر كنص عادي افتراضيًا (© ® ™ ↔ ...) ما لم تُطلب كإيموجي صراحة.
    function isEmojiSeq(seq) {
        if (seq.length === 1 || (seq.length === 2 && seq.codePointAt(0) > 0xFFFF)) {
            return PRESENTATION_RE.test(seq);
        }
        if (/^[#*0-9]/.test(seq)) return seq.indexOf('⃣') !== -1;
        var first = String.fromCodePoint(seq.codePointAt(0));
        return PRESENTATION_RE.test(first) || /[️‍]|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]/u.test(seq);
    }

    function onImgError() {
        if (this.parentNode) this.parentNode.replaceChild(document.createTextNode(this.alt), this);
    }

    function makeImg(seq) {
        var img = document.createElement('img');
        img.className = 'agp-emoji';
        img.alt = seq;
        img.draggable = false;
        img.decoding = 'async';
        img.setAttribute('aria-label', seq);
        img.addEventListener('error', onImgError);
        img.src = CDN + fileName(seq);
        return img;
    }

    function shouldSkip(el) {
        for (; el && el.nodeType === 1; el = el.parentNode) {
            if (SKIP_TAGS[el.tagName] || el.isContentEditable || el.hasAttribute('data-no-apple-emoji')) return true;
        }
        return false;
    }

    function processText(node) {
        var text = node.nodeValue;
        if (!text || !QUICK_RE.test(text)) return;
        var parent = node.parentNode;
        if (!parent || shouldSkip(parent)) return;

        SEQ_RE.lastIndex = 0;
        var frag = null, last = 0, m;
        while ((m = SEQ_RE.exec(text))) {
            if (!isEmojiSeq(m[0])) continue;
            if (!frag) frag = document.createDocumentFragment();
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            frag.appendChild(makeImg(m[0]));
            last = m.index + m[0].length;
        }
        if (!frag) return;
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        parent.replaceChild(frag, node);
    }

    function processTree(root) {
        if (!root) return;
        if (root.nodeType === 3) { processText(root); return; }
        if (root.nodeName === 'HEAD') return;
        if (root.nodeType !== 1 && root.nodeType !== 11) return;
        if (root.nodeType === 1 && shouldSkip(root)) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [], n;
        while ((n = walker.nextNode())) {
            if (QUICK_RE.test(n.nodeValue)) nodes.push(n);
        }
        for (var i = 0; i < nodes.length; i++) processText(nodes[i]);
    }

    function injectStyle() {
        if (document.getElementById('agp-apple-emoji-style')) return;
        var st = document.createElement('style');
        st.id = 'agp-apple-emoji-style';
        st.textContent =
            'img.agp-emoji{display:inline-block;width:1.15em;height:1.15em;margin:0 .05em;' +
            'vertical-align:-0.2em;object-fit:contain;border:0;padding:0;background:none;' +
            'box-shadow:none;border-radius:0;max-width:none;pointer-events:none;user-select:none;}';
        (document.head || document.documentElement).appendChild(st);
    }

    // نراقب document نفسه (وليس body) لأن بعض الصفحات المجمّعة (bundled) تستبدل
    // عنصر <html> بالكامل بعد فك الضغط.
    function start() {
        injectStyle();
        processTree(document.body);
        new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var mu = muts[i];
                if (mu.type === 'characterData') {
                    processText(mu.target);
                    continue;
                }
                for (var j = 0; j < mu.addedNodes.length; j++) {
                    var added = mu.addedNodes[j];
                    if (added === document.documentElement) {
                        injectStyle();
                        processTree(document.body);
                    } else {
                        processTree(added);
                    }
                }
            }
        }).observe(document, { childList: true, subtree: true, characterData: true });
    }

    window.AGPAppleEmoji = { parse: processTree };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
