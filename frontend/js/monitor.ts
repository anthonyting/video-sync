import {
  Notification
} from './common'

window.addEventListener('load', () => {
  const notification = new Notification(document.getElementById('toast'));

  (<NodeListOf<HTMLButtonElement>>document.querySelectorAll('button.terminate')).forEach(button => {
    button.addEventListener('click', () => {
      fetch(BASEURL + '/terminate/' + button.dataset.id, {
        method: 'POST',
        credentials: 'same-origin'
      })
      .then(res => {
        if (res.ok) {
          notification.show("Terminated client successfully");
        } else {
          notification.show("Failed to terminate client");
        }
      })
      .catch(err => {
        console.error(err);
        notification.show("Error terminating client");
      });
    });
  });
});
