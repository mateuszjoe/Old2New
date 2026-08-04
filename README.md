# OLD2NEW

Jednostronicowa wizytówka garażu Dawida w Okuniewie: ręczna pielęgnacja aut,
bieżące realizacje i szybki kontakt bez wymyślonego cennika.

## Kierunek

- ciemny, oldschoolowy garaż po godzinach,
- motoryzacyjny klimat przełomu lat 90. i 00. bez kopiowania interfejsów gier,
- mocny wordmark OLD2NEW i oszczędna paleta kości słoniowej, grafitu i oxblood,
- własny system znaku: pełne OLD2NEW w nagłówku i stopce oraz skrót O2N w faviconie,
- krótka animacja mycia kreskówkowej beemki, pokazywana najwyżej raz na dobę,
- boczna kreskówkowa beemka w burgerze: wjazd przy otwarciu i garażowa scena kolizji przy zamknięciu,
- analogowa karta przyjęcia auta jako własny motyw strony,
- stykówka z prawdziwymi zdjęciami oraz lightbox z kierunkowskazami i analogowym prędkościomierzem,
- uczciwe odnośniki do kolejnych realizacji na Instagramie i opinii Google.

## Uruchomienie

Projekt nie wymaga budowania ani instalowania zależności. Można otworzyć
`index.html` bezpośrednio albo uruchomić dowolny prosty serwer statyczny.

Parametr `?intro=1` wymusza ponowne pokazanie intro podczas testów.

## Testy

```bash
npm test
```

Test sprawdza składnię JavaScriptu, lokalne assety, strukturę galerii, kotwice,
unikalność ID, bezpieczeństwo linków zewnętrznych, metadane, mobilny viewport
i brak starych elementów HUD.

Rozszerzony test przeglądarkowy `npm run test:mobile` łączy się z Chrome DevTools
pod `http://127.0.0.1:9231` (adres można zmienić zmienną `CDP_ENDPOINT`). Sprawdza
układ, cele dotykowe, animowane menu, lightbox, klawiaturę, swipe, przywracanie
fokusu i błędy konsoli na dziewięciu viewportach od 280 px do desktopu 1440 px.
Osobno weryfikuje `prefers-reduced-motion`. Opcjonalna zmienna
`MOBILE_AUDIT_OUTPUT` zapisuje zrzuty.

## Materiały

- znak profilowy pochodzi z publicznego profilu marki na Instagramie,
- boczne grafiki auta zostały przygotowane specjalnie dla tej strony,
- pięć zdjęć galerii pochodzi z publicznych materiałów wskazanych przez właściciela:
  profilu Instagram i wizytówki Google; docelowo warto podmienić je na pliki źródłowe
  o wyższej rozdzielczości.

Wersja publiczna: <https://mateuszjoe.github.io/Old2New/>
