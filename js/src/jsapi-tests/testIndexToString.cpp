/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jsnum.h"

#include "jsapi-tests/tests.h"
#include "vm/JSContext.h"
#include "vm/Realm.h"

#include "vm/StringType-inl.h"

using mozilla::ArrayLength;

static const struct TestPair {
  uint32_t num;
  const char* expected;
} tests[] = {
    {0, "0"},
    {1, "1"},
    {2, "2"},
    {9, "9"},
    {10, "10"},
    {15, "15"},
    {16, "16"},
    {17, "17"},
    {99, "99"},
    {100, "100"},
    {255, "255"},
    {256, "256"},
    {257, "257"},
    {999, "999"},
    {1000, "1000"},
    {4095, "4095"},
    {4096, "4096"},
    {9999, "9999"},
    {1073741823, "1073741823"},
    {1073741824, "1073741824"},
    {1073741825, "1073741825"},
    {2147483647, "2147483647"},
    {2147483648u, "2147483648"},
    {2147483649u, "2147483649"},
    {4294967294u, "4294967294"},
    {4294967295u, "4294967295"},
};

BEGIN_TEST(testIndexToString) {
  for (size_t i = 0, sz = ArrayLength(tests); i < sz; i++) {
    uint32_t u = tests[i].num;
    JSString* str = js::IndexToString(cx, u);
    CHECK(str);

    if (!js::StaticStrings::hasUint(u)) {
      CHECK(cx->realm()->dtoaCache.lookup(10, u) == str);
    }

    bool match = false;
    CHECK(JS_StringEqualsAscii(cx, str, tests[i].expected, &match));
    CHECK(match);
  }

  return true;
}
END_TEST(testIndexToString)

BEGIN_TEST(testStringIsIndex) {
  for (size_t i = 0, sz = ArrayLength(tests); i < sz; i++) {
    uint32_t u = tests[i].num;
    JSFlatString* str = js::IndexToString(cx, u);
    CHECK(str);

    uint32_t n;
    CHECK(str->isIndex(&n));
    CHECK(u == n);
  }

  return true;
}
END_TEST(testStringIsIndex)

BEGIN_TEST(testStringToPropertyName) {
  uint32_t index;

  static const char16_t hiChars[] = {'h', 'i'};
  JSFlatString* hiStr = NewString(cx, hiChars);
  CHECK(hiStr);
  CHECK(!hiStr->isIndex(&index));
  CHECK(hiStr->toPropertyName(cx) != nullptr);

  static const char16_t maxChars[] = {'4', '2', '9', '4', '9',
                                      '6', '7', '2', '9', '5'};
  JSFlatString* maxStr = NewString(cx, maxChars);
  CHECK(maxStr);
  CHECK(maxStr->isIndex(&index));
  CHECK(index == UINT32_MAX);

  static const char16_t maxPlusOneChars[] = {'4', '2', '9', '4', '9',
                                             '6', '7', '2', '9', '6'};
  JSFlatString* maxPlusOneStr = NewString(cx, maxPlusOneChars);
  CHECK(maxPlusOneStr);
  CHECK(!maxPlusOneStr->isIndex(&index));
  CHECK(maxPlusOneStr->toPropertyName(cx) != nullptr);

  return true;
}

template <size_t N>
static JSFlatString* NewString(JSContext* cx, const char16_t (&chars)[N]) {
  return js::NewStringCopyN<js::CanGC>(cx, chars, N);
}

END_TEST(testStringToPropertyName)
