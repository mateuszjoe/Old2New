# OLD2NEW

Jednostronicowa wizytówka garażu Dawida w Okuniewie: ręczna pielęgnacja aut,
bieżące realizacje i szybki kontakt bez wymyślonego cennika.

## Kierunek

- ciemny, oldschoolowy garaż po godzinach,
- motoryzacyjny klimat przełomu lat 90. i 00. bez kopiowania interfejsów gier,
- mocny wordmark OLD2NEW i oszczędna paleta kości słoniowej, grafitu i oxblood,
- krótka animacja mycia kreskówkowej beemki, pokazywana najwyżej raz na dobę,
- analogowa karta przyjęcia auta jako własny motyw strony,
- uczciwe odnośniki do prawdziwych realizacji na Instagramie i opinii Google.

## Uruchomienie

Projekt nie wymaga budowania ani instalowania zależności. Można otworzyć
`index.html` bezpośrednio albo uruchomić dowolny prosty serwer statyczny.

Parametr `?intro=1` wymusza ponowne pokazanie intro podczas testów.

## Testy

```bash
npm test
```

Test sprawdza składnię JavaScriptu, lokalne assety, kotwice, unikalność ID,
bezpieczeństwo linków zewnętrznych, metadane, mobilny viewport i brak starych
elementów HUD.

Rozszerzony test przeglądarkowy `npm run test:mobile` łączy się z Chrome DevTools
pod `http://127.0.0.1:9231` (adres można zmienić zmienną `CDP_ENDPOINT`). Sprawdza
układ, cele dotykowe, menu i błędy konsoli na siedmiu viewportach od 280 px do
mobilnego landscape. Opcjonalna zmienna `MOBILE_AUDIT_OUTPUT` zapisuje zrzuty.

## Materiały

- znak profilowy pochodzi z publicznego profilu marki na Instagramie,
- grafiki auta zostały przygotowane na potrzeby tej wersji demonstracyjnej,
- prawdziwe zdjęcia realizacji i cytaty z opinii powinny trafić na stronę dopiero po
  otrzymaniu plików źródłowych i zgody na publikację — strona obecnie niczego nie udaje.

Wersja publiczna: <https://mateuszjoe.github.io/Old2New/>
