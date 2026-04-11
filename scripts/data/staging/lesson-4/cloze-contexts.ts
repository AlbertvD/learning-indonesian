// Cloze contexts for Lesson 4 — Di Hotel
// One or two contexts per vocabulary/expressions/numbers learning item
// All source_text sentences are naturalistic Indonesian with exactly one ___
// Revision 4: added 9 missing items (paspoort, akan tetapi, setelah itu, anak-anak,
//   satu juta, bak, sayuran, lauk-pauk, kopi pait); fixed Jerman slug casing
export const clozeContexts = [
  // === VOCABULARY — Rice types ===
  { learning_item_slug: "bibit padi", source_text: "Petani menanam ___ di sawah pada awal musim hujan.", translation_text: "De boer plant jonge rijstplantjes in het rijstveld aan het begin van het regenseizoen.", difficulty: "A1", topic_tag: "landbouw" },
  { learning_item_slug: "bibit padi", source_text: "Di desa itu, ___ tumbuh dengan baik karena tanahnya subur.", translation_text: "In dat dorp groeien de jonge rijstplantjes goed omdat de grond vruchtbaar is.", difficulty: "A2", topic_tag: "landbouw" },
  { learning_item_slug: "padi", source_text: "___ yang sudah tua siap untuk dipanen.", translation_text: "De rijstplant die al oud is, is klaar om geoogst te worden.", difficulty: "A1", topic_tag: "landbouw" },
  { learning_item_slug: "padi", source_text: "Sawah penuh dengan ___ yang hijau.", translation_text: "Het rijstveld is vol met groene rijstplanten.", difficulty: "A1", topic_tag: "landbouw" },
  { learning_item_slug: "gabah", source_text: "Setelah panen, petani menjemur ___ di halaman.", translation_text: "Na de oogst droogt de boer de ongepelde rijst op het erf.", difficulty: "A1", topic_tag: "landbouw" },
  { learning_item_slug: "beras", source_text: "Ibu membeli dua kilogram ___ di pasar.", translation_text: "Moeder koopt twee kilogram ongekookte rijst op de markt.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "beras", source_text: "Harga ___ naik bulan ini.", translation_text: "De prijs van ongekookte rijst is deze maand gestegen.", difficulty: "A2", topic_tag: "eten" },
  { learning_item_slug: "nasi", source_text: "___ sudah matang, kita bisa makan sekarang.", translation_text: "De rijst is klaar, we kunnen nu eten.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "nasi", source_text: "Orang Indonesia makan ___ tiga kali sehari.", translation_text: "Indonesiers eten drie keer per dag rijst.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "nasi putih", source_text: "Saya pesan ___ dan satu gelas air putih.", translation_text: "Ik bestel witte rijst en een glas water.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "nasi goreng", source_text: "___ adalah makanan yang sangat populer di Indonesia.", translation_text: "Gebakken rijst is een heel populair gerecht in Indonesie.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "nasi kuning", source_text: "Untuk ulang tahun, kami biasanya membuat ___.", translation_text: "Voor een verjaardag maken we gewoonlijk gele rijst.", difficulty: "A1", topic_tag: "eten" },

  // === VOCABULARY — Hotel & daily life ===
  { learning_item_slug: "mengantar", source_text: "Mas Wawan ___ tamu ke kamar nomor 215.", translation_text: "Mas Wawan begeleidt de gast naar kamer nummer 215.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "air", source_text: "Di kamar mandi ada ___ yang bersih untuk mandi.", translation_text: "In de badkamer is er schoon water om te baden.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "air", source_text: "___ di bak untuk mandi.", translation_text: "Het water in de bak is om te baden.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "minum", source_text: "Saya ingin ___ kopi pahit, bukan teh.", translation_text: "Ik wil zwarte koffie drinken, geen thee.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "air putih", source_text: "Tolong bawakan satu gelas ___ untuk saya.", translation_text: "Breng mij alstublieft een glas drinkwater.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "minuman", source_text: "Apa ___ yang Anda inginkan? Teh atau kopi?", translation_text: "Welke drank wilt u? Thee of koffie?", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "tetapi", source_text: "Saya suka nasi goreng, ___ saya tidak suka yang pedas.", translation_text: "Ik hou van nasi goreng, maar ik hou niet van het pittige.", difficulty: "A1", topic_tag: "voorkeur" },
  { learning_item_slug: "tetapi", source_text: "Kamar ini kecil, ___ bersih dan rapi.", translation_text: "Deze kamer is klein, maar schoon en netjes.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "anak", source_text: "Mereka punya dua ___, satu laki-laki dan satu perempuan.", translation_text: "Ze hebben twee kinderen, een jongen en een meisje.", difficulty: "A1", topic_tag: "familie" },
  { learning_item_slug: "bak air", source_text: "Di kamar mandi ada ___ yang penuh.", translation_text: "In de badkamer is een volle waterbak.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "pedas", source_text: "Sambal itu terlalu ___ untuk saya.", translation_text: "Die sambal is te heet voor mij.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "pedas", source_text: "Apa Ibu suka ayam ___?", translation_text: "Houdt mevrouw van pittige kip?", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "bersih", source_text: "Kamar mandi di hotel ini sangat ___.", translation_text: "De badkamer in dit hotel is heel schoon.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "bersih", source_text: "Handuk yang ___ ada di lemari.", translation_text: "De schone handdoek is in de kast.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "pelan-pelan", source_text: "Tolong berbicara ___, saya tidak mengerti.", translation_text: "Spreek alstublieft langzaam, ik begrijp het niet.", difficulty: "A1", topic_tag: "communicatie" },
  { learning_item_slug: "duduk", source_text: "Silakan ___ di sini, Pak.", translation_text: "Gaat u hier zitten, meneer.", difficulty: "A1", topic_tag: "beleefdheid" },
  { learning_item_slug: "duduk", source_text: "Anak-anak ___ di kursi yang kecil.", translation_text: "De kinderen zitten op de kleine stoelen.", difficulty: "A1", topic_tag: "school" },
  { learning_item_slug: "pesan", source_text: "Ibu Dewi ___ sate kambing dan gado-gado.", translation_text: "Mevrouw Dewi bestelt sate kambing en gado-gado.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "formulir", source_text: "Saya harus isi ___ hotel dulu.", translation_text: "Ik moet eerst het hotelformulier invullen.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "piring", source_text: "Tolong bawakan tiga ___ bersih.", translation_text: "Breng alstublieft drie schone borden.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "gado-gado", source_text: "___ adalah sayuran dengan saus kacang yang enak.", translation_text: "Gado-gado is groenten met een heerlijke pindasaus.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "ingin", source_text: "Saya ___ makan sate kambing malam ini.", translation_text: "Ik wil vanavond sate kambing eten.", difficulty: "A1", topic_tag: "voorkeur" },
  { learning_item_slug: "ingin", source_text: "Apa yang Anda ___? Teh atau kopi?", translation_text: "Wat wilt u? Thee of koffie?", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "pisau", source_text: "Di meja ada garpu, sendok, dan ___ untuk makan.", translation_text: "Op tafel zijn er een vork, lepel en mes om mee te eten.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "garpu", source_text: "Tolong bawakan ___ dan sendok bersih.", translation_text: "Breng alstublieft een schone vork en lepel.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "putih", source_text: "Handuk ___ ada di kamar mandi.", translation_text: "De witte handdoek is in de badkamer.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "putih", source_text: "Nasi ___ adalah makanan pokok di Indonesia.", translation_text: "Witte rijst is het basisvoedsel in Indonesie.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "gelas", source_text: "Saya minta satu ___ air putih, ya.", translation_text: "Ik vraag om een glas water, graag.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "rapi", source_text: "Kamar hotel itu sangat ___ dan bersih.", translation_text: "Die hotelkamer is heel netjes en schoon.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "gigi", source_text: "Sikat ___ saya ada di kamar mandi.", translation_text: "Mijn tandenborstel is in de badkamer.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "restoran", source_text: "Di lantai satu ada ___ yang enak.", translation_text: "Op de eerste verdieping is er een lekker restaurant.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "goreng", source_text: "Ibu ___ ayam untuk makan malam.", translation_text: "Moeder bakt kip voor het avondeten.", difficulty: "A1", topic_tag: "koken" },
  { learning_item_slug: "goreng", source_text: "Nasi ___ di sini sangat enak.", translation_text: "De gebakken rijst hier is heel lekker.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "handuk", source_text: "___ bersih ada di kamar mandi Anda.", translation_text: "Een schone handdoek is in uw badkamer.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "sabun", source_text: "Ada ___ dan sikat gigi di kamar mandi.", translation_text: "Er zijn zeep en een tandenborstel in de badkamer.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "hilang", source_text: "Kunci kamar saya ___. Di mana ya?", translation_text: "Mijn kamersleutel is weg. Waar is hij?", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "sambal", source_text: "Tolong jangan tambah ___, ini sudah pedas sekali.", translation_text: "Voeg geen sambal toe, dit is al heel erg heet.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "sate", source_text: "___ kambing di restoran ini sangat enak.", translation_text: "De sate kambing in dit restaurant is heel lekker.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "isi", source_text: "Saya harus ___ formulir ini dulu.", translation_text: "Ik moet dit formulier eerst invullen.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "sayur", source_text: "Gado-gado terbuat dari ___ segar dan saus kacang.", translation_text: "Gado-gado is gemaakt van verse groenten en pindasaus.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "jambu air", source_text: "___ yang segar ada di pasar setiap hari.", translation_text: "Verse jambu air zijn elke dag op de markt te vinden.", difficulty: "A1", topic_tag: "fruit" },
  { learning_item_slug: "sekolah", source_text: "Anak-anak pergi ke ___ setiap hari Senin sampai Jumat.", translation_text: "De kinderen gaan elke maandag tot vrijdag naar school.", difficulty: "A1", topic_tag: "school" },
  { learning_item_slug: "Jerman", source_text: "Ada tamu dari Belanda dan ada juga yang dari ___.", translation_text: "Er zijn gasten uit Nederland en er zijn er ook uit Duitsland.", difficulty: "A1", topic_tag: "landen" },
  { learning_item_slug: "selamat tinggal", source_text: "\"___, Ibu Dewi! Sampai jumpa lagi!\" kata Mas Wawan.", translation_text: "\"Vaarwel, mevrouw Dewi! Tot ziens!\" zei Mas Wawan.", difficulty: "A1", topic_tag: "beleefdheid" },
  { learning_item_slug: "juga", source_text: "Saya minta nasi goreng dan krupuk ___, ya.", translation_text: "Ik vraag ook om nasi goreng en kroepoek.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "juga", source_text: "Tambah krupuk ___ dan segelas air putih.", translation_text: "Doe er ook kroepoek bij en een glas water.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "sendok", source_text: "Tolong bawakan ___ dan garpu untuk makan.", translation_text: "Breng alstublieft een lepel en vork om mee te eten.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "kamar kecil", source_text: "Di mana ___? Saya perlu ke sana.", translation_text: "Waar is het toilet? Ik moet erheen.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "setelah", source_text: "___ makan, kami minum kopi di lobi.", translation_text: "Na het eten drinken we koffie in de lobby.", difficulty: "A1", topic_tag: "dagindeling" },
  { learning_item_slug: "kamar makan", source_text: "___ di hotel ini buka dari jam tujuh pagi.", translation_text: "De eetkamer in dit hotel opent om zeven uur 's ochtends.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "sikat", source_text: "Ada ___ gigi dan sabun di kamar mandi.", translation_text: "Er zijn een tandenborstel en zeep in de badkamer.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kamar mandi", source_text: "___ di hotel ini bersih dan rapi.", translation_text: "De badkamer in dit hotel is schoon en netjes.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "sikat gigi", source_text: "Di kamar mandi ada sabun dan ___ baru.", translation_text: "In de badkamer is er zeep en een nieuwe tandenborstel.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kambing", source_text: "Saya suka sate ___ dengan sambal.", translation_text: "Ik hou van geitensate met sambal.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "suka", source_text: "Apa Ibu ___ nasi goreng?", translation_text: "Houdt mevrouw van nasi goreng?", difficulty: "A1", topic_tag: "voorkeur" },
  { learning_item_slug: "suka", source_text: "Saya tidak ___ makanan yang terlalu pedas.", translation_text: "Ik hou niet van eten dat te heet is.", difficulty: "A1", topic_tag: "voorkeur" },
  { learning_item_slug: "kecap", source_text: "Tambahkan sedikit ___ ke dalam nasi goreng.", translation_text: "Voeg een beetje sojasaus toe aan de nasi goreng.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "tamu", source_text: "Hotel ini punya banyak ___ dari Eropa.", translation_text: "Dit hotel heeft veel gasten uit Europa.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kenyang", source_text: "Saya sudah ___. Terima kasih, makanannya enak.", translation_text: "Ik ben al voldaan. Dank u, het eten was lekker.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "teh", source_text: "Saya minta satu cangkir ___ hangat.", translation_text: "Ik vraag om een kopje warme thee.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "kopi", source_text: "Bapak minum ___ setiap pagi sebelum kerja.", translation_text: "Vader drinkt elke ochtend koffie voor het werk.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "tempat", source_text: "___ duduk di sini masih ada. Silakan!", translation_text: "Er is hier nog een zitplaats. Gaat uw gang!", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "kopi pahit", source_text: "Bapak Sahid selalu pesan ___ tanpa gula.", translation_text: "Meneer Sahid bestelt altijd zwarte koffie zonder suiker.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "tempat duduk", source_text: "Masih ada ___ di meja pojok itu.", translation_text: "Er is nog een zitplaats aan die hoektafel.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "kopi tubruk", source_text: "___ adalah kopi hitam khas Indonesia dengan gula.", translation_text: "Kopi tubruk is typisch Indonesische zwarte koffie met suiker.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "tempat tidur", source_text: "___ di kamar 215 besar dan nyaman.", translation_text: "Het bed in kamer 215 is groot en comfortabel.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "terlalu", source_text: "Makanan ini ___ pedas untuk saya.", translation_text: "Dit eten is te heet voor mij.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "terlalu", source_text: "Pisang yang ___ tua tidak enak.", translation_text: "Een banaan die te oud is, is niet lekker.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "krupuk", source_text: "Tambah ___ juga ya, Mas!", translation_text: "Doe er ook kroepoek bij, meneer!", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "tersedia", source_text: "Sarapan ___ dari jam tujuh sampai jam sepuluh.", translation_text: "Het ontbijt is beschikbaar van zeven tot tien uur.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kunci", source_text: "___ kamar Anda ada di sini, Bu.", translation_text: "Uw kamersleutel is hier, mevrouw.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kunci", source_text: "___ yang kecil dan kuning ini kunci Ibu.", translation_text: "Deze kleine gele sleutel is de sleutel van mevrouw.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "tidur", source_text: "Saya mau ___ karena capek sekali.", translation_text: "Ik wil slapen want ik ben heel moe.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "kuning", source_text: "Kunci yang kecil dan ___ ini kunci kamar Anda.", translation_text: "Deze kleine en gele sleutel is uw kamersleutel.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "tubruk", source_text: "Kopi ___ dibuat dengan menuangkan air panas langsung ke kopi.", translation_text: "Koffie tubruk wordt gemaakt door heet water direct op de koffie te gieten.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "kurang", source_text: "Maaf, garamnya ___ sedikit.", translation_text: "Sorry, er is wat te weinig zout.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "turun", source_text: "Kami ___ dari lantai dua untuk makan pagi.", translation_text: "We komen naar beneden van de tweede verdieping voor het ontbijt.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "yang", source_text: "Mana makanan ___ enak di sini?", translation_text: "Welk eten is hier lekker?", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "kursi", source_text: "Silakan duduk di ___ yang ada di pojok.", translation_text: "Ga alstublieft zitten op de stoel in de hoek.", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "lantai", source_text: "Kamar saya ada di ___ dua.", translation_text: "Mijn kamer is op de tweede verdieping.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "lauk", source_text: "Nasi putih dengan ___ ayam dan sayur sudah tersedia.", translation_text: "Witte rijst met kip als bijgerecht en groenten zijn beschikbaar.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "lemari", source_text: "Pakaian Anda bisa diletakkan di ___ di kamar.", translation_text: "Uw kleding kan in de kast op de kamer worden gelegd.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "makanan", source_text: "___ di hotel ini sangat enak dan bervariasi.", translation_text: "Het voedsel in dit hotel is heel lekker en gevarieerd.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "mandi", source_text: "Saya mau ___ dulu sebelum sarapan.", translation_text: "Ik ga eerst baden voor het ontbijt.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "mas", source_text: "___ Wawan, tolong bawakan satu gelas air putih.", translation_text: "Mas Wawan, breng alstublieft een glas water.", difficulty: "A1", topic_tag: "beleefdheid" },
  { learning_item_slug: "masih", source_text: "Apa ___ ada tempat duduk di restoran?", translation_text: "Is er nog een zitplaats in het restaurant?", difficulty: "A1", topic_tag: "restaurant" },
  { learning_item_slug: "meja", source_text: "Tolong satu ___ untuk dua orang.", translation_text: "Een tafel voor twee personen, alstublieft.", difficulty: "A1", topic_tag: "restaurant" },

  // === PREVIOUSLY MISSING ITEMS (CRITICAL fixes) ===

  // paspoort — learning item uses Dutch spelling; Indonesian word is 'paspor'
  { learning_item_slug: "paspoort", source_text: "___ Ibu di mana? Saya harus isi formulir hotel.", translation_text: "Waar is het paspoort van mevrouw? Ik moet het hotelformulier invullen.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "paspoort", source_text: "Tolong tunjukkan ___ Anda di resepsionis.", translation_text: "Laat alstublieft uw paspoort zien bij de receptie.", difficulty: "A1", topic_tag: "hotel" },

  // akan tetapi — formal 'maar/echter'
  { learning_item_slug: "akan tetapi", source_text: "Hotel ini mahal, ___ kamarnya sangat bagus.", translation_text: "Dit hotel is duur, maar de kamers zijn heel mooi.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "akan tetapi", source_text: "Saya suka sate, ___ hari ini saya pesan gado-gado.", translation_text: "Ik hou van sate, maar vandaag bestel ik gado-gado.", difficulty: "A1", topic_tag: "restaurant" },

  // setelah itu — 'daarna/vervolgens'
  { learning_item_slug: "setelah itu", source_text: "Kami makan nasi goreng, ___ kami minum kopi.", translation_text: "We eten nasi goreng, daarna drinken we koffie.", difficulty: "A1", topic_tag: "dagindeling" },
  { learning_item_slug: "setelah itu", source_text: "Saya mandi dulu, ___ saya turun ke restoran.", translation_text: "Ik bad eerst, daarna ga ik naar beneden naar het restaurant.", difficulty: "A1", topic_tag: "dagindeling" },

  // anak-anak — reduplicated form (kinderen), distinct from anak (kind)
  { learning_item_slug: "anak-anak", source_text: "Di mana ___? Yang kecil ada di kamar mandi.", translation_text: "Waar zijn de kinderen? De kleintjes zijn in de badkamer.", difficulty: "A1", topic_tag: "familie" },
  { learning_item_slug: "anak-anak", source_text: "___ bermain di halaman hotel setelah makan.", translation_text: "De kinderen spelen op het hotelerf na het eten.", difficulty: "A1", topic_tag: "familie" },

  // satu juta — 'een miljoen', distinct from sejuta
  { learning_item_slug: "satu juta", source_text: "Harga kamar hotel itu ___ rupiah per malam.", translation_text: "De prijs van die hotelkamer is een miljoen rupiah per nacht.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "satu juta", source_text: "Rumah baru itu harganya ___ dolar.", translation_text: "Dat nieuwe huis kost een miljoen dollar.", difficulty: "A2", topic_tag: "getallen" },

  // bak — 'bak/container', distinct from bak air
  { learning_item_slug: "bak", source_text: "Air di ___ untuk mandi.", translation_text: "Het water in de bak is om te baden.", difficulty: "A1", topic_tag: "hotel" },
  { learning_item_slug: "bak", source_text: "___ di kamar mandi ini cukup besar.", translation_text: "De bak in deze badkamer is groot genoeg.", difficulty: "A1", topic_tag: "hotel" },

  // sayuran — 'groenten' (collective noun), distinct from sayur
  { learning_item_slug: "sayuran", source_text: "Di pasar ada banyak ___ yang segar.", translation_text: "Op de markt zijn veel verse groenten.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "sayuran", source_text: "Gado-gado terbuat dari ___ dengan saus kacang.", translation_text: "Gado-gado is gemaakt van groenten met pindasaus.", difficulty: "A1", topic_tag: "eten" },

  // lauk-pauk — 'bijgerechten' (reduplicated), distinct from lauk
  { learning_item_slug: "lauk-pauk", source_text: "Di restoran ini ada banyak ___ yang enak.", translation_text: "In dit restaurant zijn veel lekkere bijgerechten.", difficulty: "A1", topic_tag: "eten" },
  { learning_item_slug: "lauk-pauk", source_text: "Nasi putih dengan ___ adalah makanan khas Indonesia.", translation_text: "Witte rijst met bijgerechten is een typisch Indonesisch gerecht.", difficulty: "A1", topic_tag: "eten" },

  // kopi pait — colloquial spelling of 'kopi pahit' (zwarte koffie)
  { learning_item_slug: "kopi pait", source_text: "Saya mau pesan ___ satu gelas.", translation_text: "Ik wil een glas zwarte koffie bestellen.", difficulty: "A1", topic_tag: "dranken" },
  { learning_item_slug: "kopi pait", source_text: "Bapak selalu minum ___ di pagi hari.", translation_text: "Vader drinkt altijd zwarte koffie in de ochtend.", difficulty: "A1", topic_tag: "dranken" },

  // === OTHER ITEMS from learning-items.ts ===

  // sambel — variant spelling of sambal
  { learning_item_slug: "sambel", source_text: "Nasi goreng ini kurang ___, tambah sedikit ya.", translation_text: "Deze nasi goreng heeft te weinig sambal, doe er wat bij.", difficulty: "A1", topic_tag: "eten" },

  // oke
  { learning_item_slug: "oke", source_text: "___,  terima kasih ya, Mas!", translation_text: "Oke, dank je wel, meneer!", difficulty: "A1", topic_tag: "beleefdheid" },

  // === NUMBERS ===
  { learning_item_slug: "seratus", source_text: "Harga kopi di sini ___ ribu rupiah.", translation_text: "De koffie hier kost honderdduizend rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "dua ratus", source_text: "Kamar saya nomor ___ lima belas.", translation_text: "Mijn kamer is nummer tweehonderdvijftien.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "tiga ratus", source_text: "Jarak dari hotel ke pasar kira-kira ___ meter.", translation_text: "De afstand van het hotel naar de markt is ongeveer driehonderd meter.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "empat ratus", source_text: "Harga sate kambing ___ ribu rupiah per porsi.", translation_text: "De prijs van sate kambing is vierhonderdduizend rupiah per portie.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "lima ratus", source_text: "Sabun ini harganya ___ rupiah.", translation_text: "Deze zeep kost vijfhonderd rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "enam ratus", source_text: "Ada ___ tamu di hotel ini malam ini.", translation_text: "Er zijn zeshonderd gasten in dit hotel vanavond.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "tujuh ratus", source_text: "Hotel ini punya ___ kamar di seluruh gedung.", translation_text: "Dit hotel heeft zevenhonderd kamers in het hele gebouw.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "delapan ratus", source_text: "Harga kamar per malam kira-kira ___ ribu rupiah.", translation_text: "De kamerprijs per nacht is ongeveer achthonderdduizend rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "sembilan ratus", source_text: "Ada ___ porsi nasi goreng yang dijual hari ini.", translation_text: "Er zijn negenhonderd porties nasi goreng vandaag verkocht.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "seribu", source_text: "Segelas teh harganya ___ rupiah.", translation_text: "Een glas thee kost duizend rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "dua ribu", source_text: "Krupuk ini harganya ___ rupiah per bungkus.", translation_text: "Deze kroepoek kost tweeduizend rupiah per pakje.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "sembilan ribu", source_text: "Satu porsi gado-gado ___ rupiah.", translation_text: "Een portie gado-gado kost negenduizend rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "sepuluh ribu", source_text: "Tiket bus ke kota ___ rupiah.", translation_text: "Een buskaartje naar de stad kost tienduizend rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "sejuta", source_text: "Harga kamar hotel bintang lima bisa ___ rupiah per malam.", translation_text: "De prijs van een vijfsterrenhotelkamer kan een miljoen rupiah per nacht zijn.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "semiliar", source_text: "Rumah mewah itu harganya lebih dari ___ rupiah.", translation_text: "Die luxe villa kost meer dan een miljard rupiah.", difficulty: "A1", topic_tag: "getallen" },
  { learning_item_slug: "setriliun", source_text: "Anggaran pemerintah untuk tahun ini hampir ___ rupiah.", translation_text: "De overheidsbegroting voor dit jaar is bijna een biljoen rupiah.", difficulty: "A1", topic_tag: "getallen" },
]
