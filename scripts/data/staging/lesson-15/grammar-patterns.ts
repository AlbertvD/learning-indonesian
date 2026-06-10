// Grammar patterns for Lesson 15
export const grammarPatterns = [
  {
    "pattern_name": "Het basiswoord terugvinden bij een ME-vorm (morfofonemiek omgekeerd)",
    "description":
      "De omgekeerde toepassing van de Les 13-regel: gegeven een ME-werkwoordsvorm het basiswoord (basiswoord) reconstrueren. De gebruikte variant van het voorvoegsel verraadt de beginklank van het basiswoord: me- voor l/m/n/ng/ny/r/w/y (geen verandering: melayang→layang, merasa→rasa); mem- voor b/f, of p die is weggevallen (membeli→beli, memukul→pukul); men- voor c/d/j, of t die is weggevallen (mencuci→cuci, menari→tari); meny- met weggevallen s (menyanyi→nyanyi, menyambung→sambung); meng- voor klinker/g/h, of k die is weggevallen (mengisi→isi, mengirim→kirim). Bij k, p, s, t is de ME-vorm op het eerste gezicht dubbelzinnig omdat de beginklank versmolt met de neusklank; het basiswoord en de context bepalen de juiste keuze. Tegenhanger van de productieve vormingsregel uit Les 13-14.",
    "confusion_group": "me-di-voice",
    "page_reference": null,
    "slug": "l15-me-prefix-root-recovery",
    "complexity_score": 7,
    "example": "menyambung → sambung; memukul → pukul — de s en p vallen weg en moeten hersteld worden"
  },
  {
    "pattern_name": "ME- bij leenwoorden — geen klankverandering aan de beginklank",
    "description":
      "Voorvoeging van ME- bij woorden die uit een andere taal zijn overgenomen (leenwoorden), vooral nieuwe technische termen, geschiedt dikwijls zonder klankverandering aan het begin van het woord: de beginklank K/P/S/T valt dan niet weg, ook al schrijft de gewone morfofonemische regel (Les 13) dat normaal voor. Dit verschijnsel maakt het terugvinden van het basiswoord lastiger, want de gewone reverse-regel zou de verkeerde beginklank herstellen.",
    "confusion_group": "me-di-voice",
    "page_reference": null,
    "slug": "l15-me-prefix-loanword-no-nasalization",
    "complexity_score": 6,
    "example": "memproses → proses (niet 'roses') — bij leenwoorden blijft de p staan"
  }
]
