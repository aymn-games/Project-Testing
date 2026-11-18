/**
 * يدمج ملخص الدونيشن (donations-store.summary) مع ملخص البث (live-session-stats.getSummary) —
 * للتوب (sections.donors) والهدف (totals.donations) و«آخر دعم» (totals.lastDonation).
 * لو ما فيه بث (stats = null) ينشئ ملخص فيه الدونيشن بس.
 */

'use strict';

/** @returns {object} stats بعد الدمج */
function mergeDonations(stats, summary, wantDonors) {
    var out = stats ? Object.assign({}, stats) : { sections: {}, totals: {}, live: false };
    out.sections = Object.assign({}, out.sections || {});
    out.totals = Object.assign({}, out.totals || {});
    if (wantDonors > 0) out.sections.donors = (summary.donors || []).slice(0, wantDonors);
    out.totals.donations = summary.total || 0;
    out.totals.lastDonation = summary.lastDonation || null;
    return out;
}

module.exports = { mergeDonations: mergeDonations };
