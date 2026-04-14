export class DomData {
    static toElement(html) {
        if (html instanceof HTMLElement) return html;
        if (html?.[0] instanceof HTMLElement) return html[0];
        if (typeof html?.get === `function`) {
            const element = html.get(0);
            if (element instanceof HTMLElement) return element;
        }
        return null;
    }

    static setupSheetBehaviors(sheet) {
        this._setupCollapsibleFieldsets(sheet);
        this._preventFormSubmission(sheet);
    }

    static addSubtitle(element, activity) {
        if (!element || element.querySelector(`.window-subtitle`)) return;

        const title = element.querySelector(`.window-header .window-title`);
        if (!title) return;

        const subtitle = document.createElement(`h2`);
        subtitle.classList.add(`window-subtitle`);
        subtitle.innerText = activity.item?.name || activity.name || ``;
        title.insertAdjacentElement(`afterend`, subtitle);
    }

    static _setupCollapsibleFieldsets(sheet) {
        const fieldsets = sheet.element?.querySelectorAll(`.collapsible-fieldset`);
        if (!fieldsets) return;

        const setFieldsetState = (fieldset, content, arrow, isExpanded) => {
            fieldset.dataset.expanded = isExpanded.toString();
            content.style.display = isExpanded ? `flex` : `none`;
            arrow.className = isExpanded ? `fas fa-chevron-down collapse-arrow` : `fas fa-chevron-right collapse-arrow`;
        };

        if (!sheet._fieldsetStates)
            sheet._fieldsetStates = new Map();

        fieldsets.forEach((fieldset, index) => {
            const legend = fieldset.querySelector(`.collapsible-legend`);
            const content = fieldset.querySelector(`.fieldset-content`);
            const arrow = legend?.querySelector(`.collapse-arrow`);
            if (!legend || !content || !arrow) return;
            
            const fieldsetId = fieldset.dataset.fieldsetId;
            arrow.addEventListener(`click`, (e) => {
                e.preventDefault();
                e.stopPropagation();

                const currentlyExpanded = fieldset.dataset.expanded === `true`;
                setFieldsetState(fieldset, content, arrow, !currentlyExpanded);
                sheet._fieldsetStates.set(fieldsetId, !currentlyExpanded);
            });
        });
    }

    static _preventFormSubmission(sheet) {
        sheet.element?.addEventListener(`submit`, (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        sheet.element?.querySelectorAll('input[type="text"], textarea').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                    return false;
                }
            });
        });
    }

    static toggleClass(domElement, className) {
        if (domElement.classList.contains(className))
            domElement.classList.remove(className);
        else
            domElement.classList.add(className);
    }

    static disableDialogActivities(item, html, shouldKeep) {
        html = this.toElement(html);
        if (!item?.system?.activities || !html) return;

        const removedActivities = [];
        for (const activity of item.system.activities) {
            if (shouldKeep(activity)) continue;
            removedActivities.push(activity.id);
        }

        for (const activity of removedActivities) {
            const button = html.querySelector(`button[data-activity-id="${activity}"]`);
            const li = button?.parentElement;
            if (li) li.remove();
        }
    }

    static disableTab(html, tabName, disabledText) {
        html = this.toElement(html);
        if (!html) return;

        const tab = html.querySelector(`.sheet-tabs a[data-tab="${tabName}"]`);
        if (!tab) return;

        const warning = document.createElement(`abbr`);
        warning.setAttribute(`title`, disabledText);
        warning.innerHTML = `<i class="fa-solid fa-warning" style="pointer-events: all;"></i>`;

        tab.appendChild(warning);
        tab.classList.add(`disabled-tab`);
    }

    static disableInputElement(html, selector, disabledText) {
        html = this.toElement(html);
        if (!html) return;

        html.querySelectorAll(selector).forEach(element => {
            element.setAttribute(`disabled`, `disabled`);

            const warning = document.createElement(`abbr`);
            warning.setAttribute(`title`, disabledText);
            warning.setAttribute(`style`, `max-width: 15px;`);
            warning.innerHTML = `<i class="fa-solid fa-warning"></i>`;
            element.insertAdjacentElement(`afterend`, warning);
        });
    }
}
