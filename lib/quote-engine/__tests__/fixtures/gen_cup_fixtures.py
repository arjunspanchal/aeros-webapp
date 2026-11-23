#!/usr/bin/env python3
"""Regenerate cup-rate-calc.json: the cup skill's rate_calc.py run over a matrix of real quote
set-ups. cup.diff.test.js then checks the JS engine against these numbers line by line.

  python3 lib/quote-engine/__tests__/fixtures/gen_cup_fixtures.py <path to rate_calc.py>

Re-run whenever rate_calc.py changes, and port the change into families/cup.js in the same commit.
"""
import json, subprocess, sys, pathlib

SCRIPT = sys.argv[1]
OUT = pathlib.Path(__file__).with_name("cup-rate-calc.json")

# name, python flags, the same thing as a JS spec
CASES = [
    ("SW 8oz plain, APP, GSM build", "--wall SW --size 8oz --gsm 260", dict(wall="SW", size="8oz", gsm=260)),
    ("SW 12oz plain", "--wall SW --size 12oz --gsm 280", dict(wall="SW", size="12oz", gsm=280)),
    ("SW 16oz plain", "--wall SW --size 16oz --gsm 280", dict(wall="SW", size="16oz", gsm=280)),
    ("SW 10oz (unverified die)", "--wall SW --size 10oz --gsm 280", dict(wall="SW", size="10oz", gsm=280)),
    ("generic printed SW 8oz (Praful 19-Nov)", "--wall SW --size 8oz --gsm 260 --print flexo5 --colours 1 --punch 5 --poly-rate 105",
     dict(wall="SW", size="8oz", gsm=260, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, polyRate=105)),
    ("generic printed SW 16oz", "--wall SW --size 16oz --gsm 280 --print flexo5 --colours 1 --punch 5 --poly-rate 105",
     dict(wall="SW", size="16oz", gsm=280, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, polyRate=105)),
    ("NOON SW 8oz from a measured cup", "--wall SW --size 8oz --gsm 260 --cup-weight 6.54 --print flexo5 --colours 1 --punch 5 --poly-rate 105",
     dict(wall="SW", size="8oz", gsm=260, cupWeight=6.54, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, polyRate=105)),
    ("AB Coffee DW 8oz (mfg 2.0405)", "--wall DW --size 8oz --gsm 260 --cup-weight 12.5 --print flexo5 --colours 1 --punch 5 --viana --poly-rate 105 --outer-rate 76",
     dict(wall="DW", size="8oz", gsm=260, cupWeight=12.5, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, viana=True, polyRate=105, outerRate=76)),
    ("AB Coffee DW 12oz (mfg 2.8138)", "--wall DW --size 12oz --gsm 280 --cup-weight 17 --print flexo5 --colours 1 --punch 5 --viana --poly-rate 105 --outer-rate 76",
     dict(wall="DW", size="12oz", gsm=280, cupWeight=17, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, viana=True, polyRate=105, outerRate=76)),
    ("generic printed DW 16oz, GSM build", "--wall DW --size 16oz --gsm 280 --print flexo5 --colours 1 --punch 5 --viana --poly-rate 105 --outer-rate 76",
     dict(wall="DW", size="16oz", gsm=280, print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, viana=True, polyRate=105, outerRate=76)),
    ("Hercules DW 16oz 3 colours", "--wall DW --size 16oz --gsm 280 --print flexo5 --colours 3 --punch 5 --viana --poly-rate 105 --outer-rate 76",
     dict(wall="DW", size="16oz", gsm=280, print=dict(mode="flexo", ratePerKg=5, colours=3), punchPerKg=5, viana=True, polyRate=105, outerRate=76)),
    ("NOON DW 8oz, poly board both walls", "--wall DW --size 8oz --print flexo5 --colours 1 --punch 5 --poly-rate 105",
     dict(wall="DW", size="8oz", print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5, polyRate=105)),
    ("DW 12oz plain APP, outer coated", "--wall DW --size 12oz --gsm 280 --outer-coated",
     dict(wall="DW", size="12oz", gsm=280, outerCoated=True)),
    ("Jallo DW 12oz offset outer sheet from an 800 reel", "--wall DW --size 12oz --gsm 280 --outer-gsm 290 --poly-rate 105 --outer-rate 73 --outer-sheet 750 381 9 --outer-reel 800",
     dict(wall="DW", size="12oz", gsm=280, outerGsm=290, polyRate=105, outerRate=73, outerSheet=dict(w=750, h=381, ups=9), outerReel=800)),
    ("DW 16oz offset print 3 colours on its own sheet", "--wall DW --size 16oz --gsm 280 --outer-gsm 290 --poly-rate 105 --outer-rate 73 --outer-sheet 750 440 9 --print offset --colours 3 --offset-sheet-rate 1.5",
     dict(wall="DW", size="16oz", gsm=280, outerGsm=290, polyRate=105, outerRate=73, outerSheet=dict(w=750, h=440, ups=9), print=dict(mode="offset", colours=3, offsetSheetRate=1.5))),
    ("Zepto tub 350 ml (cost 1.6922)", "--wall TUB --size 350_ml --gsm 280 --paper TNPL --print flexo5 --punch 5",
     dict(wall="TUB", size="350_ml", gsm=280, paper="TNPL", print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5)),
    ("Zepto tub 400 ml (cost 1.7787)", "--wall TUB --size 400_ml --gsm 280 --paper TNPL --print flexo5 --punch 5",
     dict(wall="TUB", size="400_ml", gsm=280, paper="TNPL", print=dict(mode="flexo", ratePerKg=5, colours=1), punchPerKg=5)),
    ("tub 750 ml plain 300 GSM", "--wall TUB --size 750_ml --gsm 300", dict(wall="TUB", size="750_ml", gsm=300)),
    ("tub 500 ml on a supplied die", "--wall TUB --size 500_ml --gsm 300 --sheet 670 420 8 --glue-g 0.7",
     dict(wall="TUB", size="500_ml", gsm=300, sheet=dict(w=670, h=420, ups=8), glueG=0.7)),
    ("SW 12oz customer case pack + carton", "--wall SW --size 12oz --gsm 280 --case-pack 600 --carton 55",
     dict(wall="SW", size="12oz", gsm=280, casePack=600, carton=55)),
    ("DW 8oz FOB per cup into the cost", "--wall DW --size 8oz --cup-weight 12.5 --fob 78805 --cups-per-container 516000 --fx 98",
     dict(wall="DW", size="8oz", cupWeight=12.5, export=dict(chargesPerContainer=78805, unitsPerContainer=516000, fx=98))),
]

out = []
for name, flags, spec in CASES:
    res = subprocess.run([sys.executable, "-I", SCRIPT, *flags.split(), "--margin", "0", "--json"], capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"{name}: {res.stderr or res.stdout}")
    d = json.loads(res.stdout)
    out.append(dict(name=name, flags=flags, spec=spec,
                    expected=dict(rm=d["rm"], mfg=d["mfg"], cost=d["cost"], paperG=d["paper_g"], casePack=d["qty"],
                                  lines=[v for _, v in d["lines"]])))
OUT.write_text(json.dumps(out, indent=1) + "\n")
print(f"wrote {len(out)} cases to {OUT.name}")
