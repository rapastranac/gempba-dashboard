import { expect } from 'chai';
import { RateAgreement } from './rate-agreement';

describe('RateAgreement', () => {

    it('is unknown until frames were measured', () => {
        expect([RateAgreement.of(500, undefined), RateAgreement.of(500, Number.NaN), RateAgreement.of(0, 500)]).to.deep.equal(['unknown', 'unknown', 'unknown']);
    });

    it('agrees within a quarter of the rate set', () => {
        expect([RateAgreement.of(500, 510), RateAgreement.of(500, 625), RateAgreement.of(500, 375)]).to.deep.equal(['agrees', 'agrees', 'agrees']);
    });

    it('differs beyond it, as when gempba clamped or ignored the rate', () => {
        expect([RateAgreement.of(500, 1000), RateAgreement.of(100, 50), RateAgreement.of(500, 630)]).to.deep.equal(['differs', 'differs', 'differs']);
    });
});
