import { Notification } from './common';

function onLoad() {
  const notify = new Notification(document.getElementById('toast'));
  (<NodeListOf<HTMLButtonElement>>document.querySelectorAll('button.choose'))
    .forEach(button => {
      button.addEventListener('click', () => {
        fetch(`${BASEURL}/library/manage/set`, {
          method: 'POST',
          body: JSON.stringify({
            content: button.dataset.content
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        })
          .then(res => {
            if (!res.ok) {
              notify.show("Error setting video element");
            } else {
              notify.show("Set video element success");
            }
          })
          .catch(err => {
            notify.show("Error setting video element");
          });
      });
    });
}

if (document.readyState !== 'loading') {
  onLoad();
}

window.addEventListener('DOMContentLoaded', onLoad);
