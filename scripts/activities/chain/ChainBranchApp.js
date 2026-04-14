import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

export class ChainBranchApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `chain-branch-app` ],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/chain-branch.hbs`,
        },
    };

    constructor(activity, trigger, activities, options = {}) {
        super({
            window: {
                title: `Select Activity`,
            },
            ...options,
        });
        this.activity = activity;
        this.trigger = trigger;
        this.activities = activities;
        this.selectedId = undefined;
        this.executeAll = false;
    }

    /** @inheritdoc */
    async _prepareContext() {
        const activities = this.activities.map(activityIndex => {
            const activityId = this.activity.chainedActivityIds[activityIndex];
            const activity = this.activity.item?.system.activities.get(activityId);
            const activityName = this.activity.chainedActivityNames[activityIndex] || activity?.name || activity?.type || `Activity ${activityIndex + 1}`;
            
            return {
                index: activityIndex,
                id: activityId,
                name: activityName,
                type: activity?.type || `unknown`,
                icon: activity?.img || `icons/svg/mystery-man.svg`,
            };
        });

        return {
            activities,
            trigger: this.trigger,
            executeAll: this.executeAll,
            selectedId: this.selectedId,
            hasMultiple: false,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.element.querySelectorAll(`.item-choice`).forEach(checkbox => {
            checkbox.addEventListener(`change`, () => {
                this.selectedId = checkbox.checked ? checkbox.dataset.item : undefined;
                this.render();
            });
        });

        // this.element.querySelector(`.execute-all`).addEventListener(`change`, (event) => {
        //     this.executeAll = event.currentTarget.checked;
        //     this.render();
        // });

        this.element.querySelector(`.finish-branch-btn`).addEventListener(`click`, () => {
            if (this.selectedId === undefined) return;

            const activityIndex = this.activity.chainedActivityIds.indexOf(this.selectedId);
            this.activity.executeChainedActivity(activityIndex);
            this.close();
        });

        this.element.querySelector(`.cancel-branch-btn`).addEventListener(`click`, () => {
            this.close();
        });
    }
}
