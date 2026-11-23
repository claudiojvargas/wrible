#include <algorithm>
#include <cmath>
#include <codecvt>
#include <iostream>
#include <locale>
#include <memory>
#include <sstream>
#include <string>

#include "RecognizerWrapper.h"
#include "langid.h"

namespace {
struct DropRecognizer {
  void operator()(RECOGNIZER_PTR value) const { HWR_FreeRecognizer(value, nullptr, nullptr, nullptr); }
};

bool readInk(std::istringstream& request, INK_DATA_PTR ink) {
  int strokeCount;
  if (!(request >> strokeCount) || strokeCount < 1 || strokeCount > 2000) return false;

  int totalPoints = 0;
  for (int i = 0; i < strokeCount; ++i) {
    int count;
    if (!(request >> count) || count < 1 || count > 100000 - totalPoints) return false;
    totalPoints += count;
    const int stroke = INK_AddEmptyStroke(ink, 3, 0);
    if (stroke < 0) return false;
    for (int j = 0; j < count; ++j) {
      float x, y;
      int pressure;
      if (!(request >> x >> y >> pressure) || !std::isfinite(x) || !std::isfinite(y)
          || x < 0 || y < 0 || x > 20000 || y > 20000 || pressure < 0 || pressure > 254) return false;
      INK_AddPixelToStroke(ink, stroke, x, y, pressure);
    }
  }
  std::string extra;
  return !(request >> extra);
}
}

int main(int argc, char** argv) {
  if (argc != 2) {
    std::cerr << "Usage: writepad-worker PATH_TO_DICTIONARY\n";
    return 2;
  }

  const char* dictionary = argv[1];
  std::unique_ptr<void, DropRecognizer> recognizer;
  int currentLanguage = -1;
  std::string line;

  while (std::getline(std::cin, line)) {
    std::istringstream request(line);
    std::string language;
    request >> language;
    const int languageId = language == "pt-BR" ? LANGUAGE_PORTUGUESEB
                         : language == "en-US" ? LANGUAGE_ENGLISH : -1;
    if (languageId < 0) {
      std::cout << "ERR\tUnsupported language" << std::endl;
      continue;
    }

    std::unique_ptr<void, decltype(&INK_FreeData)> ink(INK_InitData(), &INK_FreeData);
    if (!ink || !readInk(request, ink.get())) {
      std::cout << "ERR\tInvalid ink" << std::endl;
      continue;
    }

    if (currentLanguage != languageId || !recognizer) {
      int flags = -1;
      recognizer.reset(HWR_InitRecognizer(dictionary, nullptr, nullptr, nullptr, languageId, &flags));
      if (!recognizer || HWR_GetLanguageID(recognizer.get()) != languageId || (flags & FLAG_MAINDICT) == 0) {
        recognizer.reset();
        std::cout << "ERR\tUnable to load WritePad language or dictionary" << std::endl;
        continue;
      }
      currentLanguage = languageId;
    }

    HWR_Reset(recognizer.get());
    const UCHR* result = HWR_RecognizeInkData(recognizer.get(), ink.get(), 0, -1, true, false, false, false);
    std::u16string unicode;
    for (; result && *result; ++result) unicode.push_back(static_cast<char16_t>(*result));
    std::replace(unicode.begin(), unicode.end(), u'\r', u' ');
    std::replace(unicode.begin(), unicode.end(), u'\n', u' ');
    try {
      const std::string text = std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t>{}.to_bytes(unicode);
      std::cout << "OK\t" << text << std::endl;
    } catch (const std::range_error&) {
      std::cout << "ERR\tInvalid Unicode result" << std::endl;
    }
  }
}
