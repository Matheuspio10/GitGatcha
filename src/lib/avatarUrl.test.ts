import { test } from 'node:test';
import assert from 'node:assert';
import { sizedAvatar } from './avatarUrl';

test('GitHub avatars get twice the displayed size', () => {
  assert.strictEqual(sizedAvatar('https://avatars.githubusercontent.com/u/810438?v=4', 32), 'https://avatars.githubusercontent.com/u/810438?v=4&s=64');
  assert.strictEqual(sizedAvatar('https://github.com/gaearon.png', 24), 'https://github.com/gaearon.png?size=48');
});

test('an existing size is replaced and the size is capped at the original 460px', () => {
  assert.strictEqual(sizedAvatar('https://github.com/gaearon.png?size=64', 36), 'https://github.com/gaearon.png?size=72');
  assert.strictEqual(sizedAvatar('https://avatars.githubusercontent.com/u/1?v=4&s=40', 400), 'https://avatars.githubusercontent.com/u/1?v=4&s=460');
});

test('other images are left alone', () => {
  for (const url of ['data:image/png;base64,AAAA', 'https://lh3.googleusercontent.com/a/xyz=s96-c', 'https://github.com/gaearon', 'not a url', '', null, undefined]) {
    assert.strictEqual(sizedAvatar(url, 32), url);
  }
});
