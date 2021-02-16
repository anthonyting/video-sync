import { Notification } from './common';

function onError(err: any, notification: Notification) {
  notification.show(err.message);
}

function clearNode(node: Element) {
  while (node.firstChild) {
    node.firstChild.remove();
  }
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const result = await fetch(url, init);

  if (!result.ok) {
    throw await result.json();
  }

  return result.json();
}

function onLoad() {
  const searchForm: HTMLFormElement = <HTMLFormElement>document.getElementById('searchForm');
  const notification = new Notification(document.getElementById("toast"));
  const searchResults = document.getElementById('searchResults');
  const modalElement = document.getElementById('modal');
  const modal = new bootstrap.Modal(modalElement);
  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const url = new URL(`${window.location.origin}${BASEURL}/library/search`);
    url.searchParams.append('search', (<HTMLInputElement>document.getElementById("search")).value);
    fetchJson(url.toString())
      .then(json => {
        clearNode(searchResults);
        for (let i = 0; i < json.length; i++) {
          const a = document.createElement('a');
          a.textContent = json[i].info.title;
          a.className = "text-white";
          a.href = `#${json[i].key}`;
          a.addEventListener('click', e => {
            e.preventDefault();
            const metadata = new URL(`${window.location.origin}${BASEURL}/library/metadata`);
            metadata.searchParams.append('id', json[i].id);
            metadata.searchParams.append('show', String(json[i].info.type === 'show'));
            fetchJson(metadata.toString())
              .then(json => {
                console.log(json);
                const modalBody = modalElement.querySelector('.modal-body');
                clearNode(modalBody);
                const ul = document.createElement('ul');
                for (let i = 0; i < json.length; i++) {
                  const li = document.createElement('li');
                  const a = document.createElement('a');
                  a.href = `#${json[i].key}`;
                  a.textContent = json[i].title;
                  li.appendChild(a);
                  ul.appendChild(li);
                }
                modalBody.appendChild(ul);
                modal.show();
              })
              .catch(err => onError(err, notification));
          });
          searchResults.appendChild(a);
        }
      })
      .catch(err => onError(err, notification));
  });
}

if (document.readyState !== 'loading') {
  onLoad();
}

window.addEventListener('DOMContentLoaded', onLoad);
