import { Notification } from './common';
import * as LRU from 'lru-cache';

function onError(err: any, notification: Notification) {
  console.error(err);
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

function confirmSelection(modalElement: Element, modal: bootstrap.Modal, json: any) {
  const modalBody = modalElement.querySelector('.modal-body');
  modalBody.textContent = `Are you sure you want to queue up ${json.title} for encoding?`;

  const yes = <HTMLButtonElement>modalElement.querySelector('.yes');

  const queue = new URL(`${window.location.origin}${BASEURL}/library/queue/${json.ratingKey}`);
  yes.onclick = e => {
    e.preventDefault();
    fetchJson(queue.toString(), {
      method: 'POST'
    })
      .then(json => {
        console.log(json);
        modal.hide();
      });
  };

  modal.show();
}

const metadataCache: LRU<string, any> = new LRU({
  max: 500,
  maxAge: 5 * 60 * 1000 // 5 minutes
});
async function setMetadata(modalElement: Element, modal: bootstrap.Modal, confirmModal: bootstrap.Modal, notification: Notification, key: string, parentKey: string) {
  const cache = metadataCache.get(key);
  const metadata = new URL(`${window.location.origin}${BASEURL}/library/metadata`);
  metadata.searchParams.append('key', key);

  const json = cache || await fetchJson(metadata.toString());

  const modalBody = modalElement.querySelector('.modal-body');

  clearNode(modalBody);
  const ul = document.createElement('ul');
  for (let i = 0; i < json.length; i++) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${json[i].key}`;
    a.textContent = json[i].title;
    a.addEventListener('click', e => {
      if (json[i].type === 'show' || json[i].type === 'episode' || json[i].type === 'movie') {
        clearNode(modalBody);
        modal.hide();
        confirmSelection(document.getElementById('confirmModal'), confirmModal, json[i]);
      } else {
        setMetadata(modalElement, modal, confirmModal, notification, json[i].key, json[i].parentKey)
          .catch(err => onError(err, notification));
      }
    });
    li.appendChild(a);
    ul.appendChild(li);
  }
  modalBody.appendChild(ul);
  modal.show();

  if (!cache) {
    metadataCache.set(key, json);
  }
  return json;
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
            setMetadata(modalElement, modal, new bootstrap.Modal(document.getElementById('confirmModal')), notification, json[i].key, json[i].parentKey)
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
