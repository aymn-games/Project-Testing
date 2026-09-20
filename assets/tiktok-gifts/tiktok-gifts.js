/**
 * أيقونات دعم تيك توك الحقيقية (نفس أيقونات هدايا البثوث)، مرتّبة تصاعدياً
 * حسب الكوينز. أي لعبة فيها خيار "إنعاش عن طريق الدعم" تقدر تستدعيها من هنا
 * بدل تكرار نسخة محلية. المسارات بـgifts.json نسبية لهذا المجلد.
 *
 * الاستخدام من داخل صفحة لعبة (games/<game>/index.html):
 *   <script src="../../assets/tiktok-gifts/tiktok-gifts.js"></script>
 *   ثم: AymanGamesPlatform.tiktokGifts.list  // مصفوفة مرتّبة تصاعدياً
 *       AymanGamesPlatform.tiktokGifts.iconUrl(gift)  // رابط الأيقونة الكاملة
 *       AymanGamesPlatform.tiktokGifts.byId('lion')   // هدية واحدة بمعرّفها
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var BASE_URL = (function () {
        var scripts = document.getElementsByTagName('script');
        var thisScript = scripts[scripts.length - 1];
        return thisScript.src.replace(/tiktok-gifts\.js(\?.*)?$/, '');
    })();

    var LIST = [
        { id: 'cake-slice', label: 'قطعة كعك', coins: 1, file: 'icons/00001-cake-slice.webp' },
        { id: 'ice-cream', label: 'أيس كريم', coins: 1, file: 'icons/00001-ice-cream.webp' },
        { id: 'love-saudi', label: 'أحب السعودية', coins: 1, file: 'icons/00001-love-saudi.webp' },
        { id: 'rose', label: 'وردة', coins: 1, file: 'icons/00001-rose.webp' },
        { id: 'tiktok', label: 'TikTok', coins: 1, file: 'icons/00001-tiktok.webp' },
        { id: 'finger-heart', label: 'قلب بالإصبع', coins: 5, file: 'icons/00005-finger-heart.webp' },
        { id: 'rosa', label: 'روزا', coins: 10, file: 'icons/00010-rosa.webp' },
        { id: 'donut', label: 'دونات', coins: 30, file: 'icons/00030-donut.webp' },
        { id: 'butterfly', label: 'فراشة', coins: 88, file: 'icons/00088-butterfly.webp' },
        { id: 'hat-and-mustache', label: 'قبعة وشارب', coins: 99, file: 'icons/00099-hat-and-mustache.webp' },
        { id: 'paper-crane', label: 'طائر ورقي', coins: 99, file: 'icons/00099-paper-crane.webp' },
        { id: 'saudi-in-heart', label: 'السعودية في القلب', coins: 99, file: 'icons/00099-saudi-in-heart.webp' },
        { id: 'heart-in-your-hands-a', label: 'قلبي بين يديك', coins: 100, file: 'icons/00100-heart-in-your-hands-a.webp' },
        { id: 'heart-in-your-hands-b', label: 'قلبي بين يديك', coins: 100, file: 'icons/00100-heart-in-your-hands-b.webp' },
        { id: 'kings-scepter', label: 'عصا الملك', coins: 150, file: 'icons/00150-kings-scepter.webp' },
        { id: 'kiss', label: 'قبلة', coins: 150, file: 'icons/00150-kiss.webp' },
        { id: 'hearts', label: 'قلوب', coins: 199, file: 'icons/00199-hearts.webp' },
        { id: 'corgi', label: 'كورجي', coins: 299, file: 'icons/00299-corgi.webp' },
        { id: 'galaxy', label: 'مجرة', coins: 1000, file: 'icons/01000-galaxy.webp' },
        { id: 'diving-with-whales', label: 'الغوص مع الحيتان', coins: 2150, file: 'icons/02150-diving-with-whales.webp' },
        { id: 'lion', label: 'أسد', coins: 29999, file: 'icons/29999-lion.webp' }
    ];

    function iconUrl(gift) {
        return BASE_URL + gift.file;
    }

    function byId(id) {
        for (var i = 0; i < LIST.length; i++) {
            if (LIST[i].id === id) return LIST[i];
        }
        return null;
    }

    AGP.tiktokGifts = {
        list: LIST,
        iconUrl: iconUrl,
        byId: byId
    };
})(window.AymanGamesPlatform);
