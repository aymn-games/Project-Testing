/**
 * حصيلة — بنك أسئلة فئة «شعارات البراندات» (من ملف صاحب المنصة). الشعار صورة من images/logos/ (Simple Icons، CC0). المتوفر 49 من 219 براند فقط (أغلب البراندات السعودية والخليجية ما لها شعار بالمكتبة)، فتوزعت المستويات من جديد على المتوفر.
 * كل سؤال: [السؤال، الجواب، بدائل مقبولة، (بيانات الصورة — للشعارات)]، ومجمّعة حسب النقاط (200 سهل، 400 متوسط، 600 صعب).
 * اللعبة تقرأه من AGP.hasilaBank.brands.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';
    var out = [];
    function add(points, list) {
        list.forEach(function (x) {
            var q = { q: x[0], a: x[1], alt: x[2] || [], p: points };
            if (x[3]) { q.img = x[3].img; q.bg = x[3].bg; }
            out.push(q);
        });
    }

    add(200, [
        ["وش هذا الشعار؟", "Nike", ["نايك", "نايكي"], {"img": "images/logos/nike.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Adidas", ["اديداس"], {"img": "images/logos/adidas.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Apple", ["ابل", "آبل", "ايفون"], {"img": "images/logos/apple.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Samsung", ["سامسونج", "سامسونق"], {"img": "images/logos/samsung.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Coca-Cola", ["كوكا كولا", "كوكاكولا", "كولا"], {"img": "images/logos/cocacola.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "McDonald's", ["ماكدونالدز", "ماك", "ماكدونالد", "McDonalds"], {"img": "images/logos/mcdonalds.svg", "bg": "dark"}],
        ["وش هذا الشعار؟", "KFC", ["كنتاكي"], {"img": "images/logos/kfc.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Burger King", ["برجر كنج", "برقر كنق", "برجر كينج", "برقر كينق"], {"img": "images/logos/burgerking.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Starbucks", ["ستاربكس"], {"img": "images/logos/starbucks.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "H&M", ["اتش اند ام", "HM"], {"img": "images/logos/handm.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Toyota", ["تويوتا"], {"img": "images/logos/toyota.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "BMW", ["بي ام دبليو", "بي ام"], {"img": "images/logos/bmw.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Ferrari", ["فيراري"], {"img": "images/logos/ferrari.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Tesla", ["تسلا"], {"img": "images/logos/tesla.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Netflix", ["نتفلكس", "نتفليكس"], {"img": "images/logos/netflix.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "YouTube", ["يوتيوب"], {"img": "images/logos/youtube.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Google", ["قوقل", "جوجل"], {"img": "images/logos/google.svg", "bg": "light"}]
    ]);

    add(400, [
        ["وش هذا الشعار؟", "Puma", ["بوما"], {"img": "images/logos/puma.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "New Balance", ["نيو بالانس"], {"img": "images/logos/newbalance.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Sony", ["سوني"], {"img": "images/logos/sony.svg", "bg": "dark"}],
        ["وش هذا الشعار؟", "LG", ["ال جي"], {"img": "images/logos/lg.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "IKEA", ["ايكيا"], {"img": "images/logos/ikea.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Zara", ["زارا"], {"img": "images/logos/zara.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Lamborghini", ["لامبورغيني", "لمبرقيني", "لامبورجيني", "لمبورقيني"], {"img": "images/logos/lamborghini.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Honda", ["هوندا"], {"img": "images/logos/honda.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Hyundai", ["هيونداي"], {"img": "images/logos/hyundai.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Kia", ["كيا"], {"img": "images/logos/kia.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Porsche", ["بورش"], {"img": "images/logos/porsche.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Jeep", ["جيب"], {"img": "images/logos/jeep.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Intel", ["انتل"], {"img": "images/logos/intel.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "HP", ["اتش بي"], {"img": "images/logos/hp.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Dell", ["ديل"], {"img": "images/logos/dell.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Saudia", ["السعودية", "الخطوط السعودية"], {"img": "images/logos/saudia.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Emirates", ["طيران الامارات", "الاماراتية", "الامارات"], {"img": "images/logos/emirates.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Airbnb", ["اير بي ان بي", "ايربنب"], {"img": "images/logos/airbnb.svg", "bg": "light"}]
    ]);

    add(600, [
        ["وش هذا الشعار؟", "Dior", ["ديور"], {"img": "images/logos/dior.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Ford", ["فورد"], {"img": "images/logos/ford.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Nikon", ["نيكون"], {"img": "images/logos/nikon.svg", "bg": "dark"}],
        ["وش هذا الشعار؟", "Panasonic", ["باناسونيك"], {"img": "images/logos/panasonic.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Red Bull", ["ريد بول"], {"img": "images/logos/redbull.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Qatar Airways", ["القطرية", "الخطوط القطرية", "طيران قطر"], {"img": "images/logos/qatarairways.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Etihad Airways", ["الاتحاد", "طيران الاتحاد"], {"img": "images/logos/etihadairways.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Turkish Airlines", ["التركية", "الخطوط التركية", "الخطوط الجوية التركية"], {"img": "images/logos/turkishairlines.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Lufthansa", ["لوفتهانزا"], {"img": "images/logos/lufthansa.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Booking.com", ["بوكينق", "بوكينج", "Booking"], {"img": "images/logos/bookingdotcom.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Iberia", ["ايبيريا"], {"img": "images/logos/iberia.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "The North Face", ["نورث فيس", "North Face"], {"img": "images/logos/thenorthface.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Under Armour", ["اندر ارمر"], {"img": "images/logos/underarmour.svg", "bg": "light"}],
        ["وش هذا الشعار؟", "Uniqlo", ["يونيكلو"], {"img": "images/logos/uniqlo.svg", "bg": "light"}]
    ]);
    var bank = AGP.hasilaBank = AGP.hasilaBank || {};
    bank.brands = { key: 'brands', name: 'شعارات البراندات', icon: '🛍️', questions: out };
})(window.AymanGamesPlatform);
