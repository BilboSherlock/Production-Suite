'use strict';
/* ===================================================================
   Finance — the older global names, kept for the rest of the app.
   The rules live in js/models/budget.model.js (BudgetModel); the
   Budget section uses js/viewmodels/budget.vm.js.
   =================================================================== */
const finNum = BudgetModel.num;
const FIN_UNITS = BudgetModel.UNITS;
const FIN_STATUS = BudgetModel.STATUS;
const FIN_STATUS_HELP = BudgetModel.STATUS_HELP;
const FIN_COLORS = BudgetModel.COLORS;
const ADD_BASES = BudgetModel.ADD_BASES;
const FIN_TEMPLATES = BudgetModel.TEMPLATES;
const templateKey = BudgetModel.templateKey;
const finLine = BudgetModel.line;
const lineEst = BudgetModel.lineEst;
const finMoney = (P, n, cents) => BudgetModel.money(P, n, cents);
const finShort = (P, n) => BudgetModel.short(P, n);
/** the region's word for fringes */
const finFringeName = P => ((typeof REGIONS !== 'undefined' && REGIONS[(P.settings || {}).region]) || { terms: { fringes: 'Fringes & payroll' } }).terms.fringes;
/** make sure the project has a valid finance record (changes the project) */
const finEnsure = P => BudgetModel.ensure(P, { fringeName: finFringeName(P) });
/** totals for reading — doesn't change the project */
const finCalc = P => BudgetModel.calc(P);
const finBaselineTotal = P => BudgetModel.baselineTotal(P);
/** gear category → budget category (podcast names win over photo ones) */
const finGearCats = () => Object.assign({}, typeof GEAR_BUDGET !== 'undefined' ? GEAR_BUDGET : {}, typeof PODCAST_GEAR_BUDGET !== 'undefined' ? PODCAST_GEAR_BUDGET : {});
function finSyncProduction(P) { const r = BudgetModel.syncProduction(P, { fromRates: buildBudgetFromRates, gearCats: finGearCats() }); finEnsure(P); Store.touch(); return r; }
function finPortfolio() { return BudgetModel.portfolio(Object.values(Store.projects)); }
