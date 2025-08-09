export class DomData {
    static toggleClass(domElement, className) {
        if (domElement.classList.contains(className))
            domElement.classList.remove(className);
        else
            domElement.classList.add(className);
    }

    static disableDialogActivities(item, html, shouldKeep) {
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
        const tab = html.querySelector(`.sheet-tabs a[data-tab="${tabName}"]`);
        if (!tab) return;

        const warning = document.createElement(`abbr`);
        warning.setAttribute(`title`, disabledText);
        warning.innerHTML = `<i class="fa-solid fa-warning" style="pointer-events: all;"></i>`;

        tab.appendChild(warning);
        tab.classList.add(`disabled-tab`);
    }

    static disableInputElement(html, selector, disabledText) {
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
