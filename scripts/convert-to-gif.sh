#!/bin/bash
# convert-to-gif.sh
# Converts exported .rgba sprite files to .png (static) and .gif (animated)
# at both 1x and 2x resolution using ImageMagick.
#
# .rgba format: 12-byte header ("RGBA" magic + width LE32 + height LE32) + raw RGBA pixels
#
# Output structure (max depth 2):
#   export/{category}/{name}.png        (1x static)
#   export/{category}/{name}@2x.png    (2x static)
#   export/{category}/{name}.gif       (1x animated, if >1 frame)
#   export/{category}/{name}@2x.gif    (2x animated, if >1 frame)
#
# Usage: bash scripts/convert-to-gif.sh

set -euo pipefail

CONVERT="/opt/homebrew/bin/convert"
EXPORT_DIR="export"
DELAY=12  # Animation delay in 1/100s (12 = ~8fps, close to game timing)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

converted=0
upscaled=0
animated=0
errors=0

echo "=== Sprite Conversion ==="
echo "Source: ${EXPORT_DIR}/"
echo ""

# Verify ImageMagick
if [ ! -f "$CONVERT" ]; then
    echo "ERROR: ImageMagick not found at $CONVERT"
    echo "Install: brew install imagemagick"
    exit 1
fi

# ── Helper: read RGBA dimensions from header ─────────────────────────────
read_rgba_dims() {
    local file="$1"
    w=$(od -A n -t u4 -j 4 -N 4 "$file" | tr -d ' ')
    h=$(od -A n -t u4 -j 8 -N 4 "$file" | tr -d ' ')
}

# ── Phase 1: Convert all .rgba → .png (1x) ─────────────────────────────
echo "--- Phase 1: .rgba → .png (1x) ---"

for category in characters solids scenery; do
    catdir="${EXPORT_DIR}/${category}"
    [ -d "$catdir" ] || continue

    for rgba_file in "${catdir}"/*.rgba; do
        [ -f "$rgba_file" ] || continue
        bname="$(basename "$rgba_file" .rgba)"
        png_file="${catdir}/${bname}.png"

        read_rgba_dims "$rgba_file"
        if [ -z "$w" ] || [ -z "$h" ] || [ "$w" -eq 0 ] || [ "$h" -eq 0 ]; then
            echo -e "${RED}SKIP${NC} ${bname}: bad dims (${w}x${h})"
            errors=$((errors + 1))
            continue
        fi

        # Strip 12-byte header and pipe raw RGBA to ImageMagick
        if tail -c +13 "$rgba_file" | \
           "$CONVERT" -size "${w}x${h}" -depth 8 rgba:- "${png_file}" 2>/dev/null; then
            converted=$((converted + 1))
        else
            echo -e "${RED}ERROR${NC} ${bname}: conversion failed"
            errors=$((errors + 1))
        fi
    done
done

echo -e "  ${GREEN}Converted${NC} ${converted} sprites to .png (1x)"

# ── Phase 2: Create @2x PNGs ────────────────────────────────────────────
echo ""
echo "--- Phase 2: .png → @2x.png ---"

for category in characters solids scenery; do
    catdir="${EXPORT_DIR}/${category}"
    [ -d "$catdir" ] || continue

    for png_file in "${catdir}"/*.png; do
        [ -f "$png_file" ] || continue
        bname="$(basename "$png_file" .png)"
        case "$bname" in *@2x*) continue;; esac
        png2x="${catdir}/${bname}@2x.png"

        if "$CONVERT" "$png_file" -filter point -resize 200% "$png2x" 2>/dev/null; then
            upscaled=$((upscaled + 1))
        else
            echo -e "${RED}ERROR${NC} ${bname}: upscale failed"
            errors=$((errors + 1))
        fi
    done
done

echo -e "  ${GREEN}Created${NC} ${upscaled} @2x PNGs"

# ── Phase 3: Create animated GIFs ───────────────────────────────────────
echo ""
echo "--- Phase 3: Animated GIFs ---"

# Write all base names (non-2x) to a temp file for grouping
tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT

for category in characters solids scenery; do
    catdir="${EXPORT_DIR}/${category}"
    [ -d "$catdir" ] || continue

    for png_file in "${catdir}"/*.png; do
        [ -f "$png_file" ] || continue
        bname="$(basename "$png_file" .png)"
        case "$bname" in *@2x*) continue;; esac
        echo "${category}|${bname}" >> "$tmpfile"
    done
done

# Group by removing last '-' segment → group key
# Frames sharing a group key are animation frames
prev_group=""
prev_cat=""
frame_files=()

flush_gif() {
    local cat="$1" group="$2"
    shift 2
    local files=("$@")

    if [ ${#files[@]} -le 1 ]; then
        return
    fi

    local gif_file="${EXPORT_DIR}/${cat}/${group}.gif"
    local gif2x="${EXPORT_DIR}/${cat}/${group}@2x.gif"

    # Sort files by frame name for consistent ordering
    IFS=$'\n' sorted=($(for f in "${files[@]}"; do basename "$f" .png; done | sort)); unset IFS

    sorted_files=()
    for s in "${sorted[@]}"; do
        sf="${EXPORT_DIR}/${cat}/${s}.png"
        [ -f "$sf" ] && sorted_files+=("$sf")
    done

    if [ ${#sorted_files[@]} -le 1 ]; then
        return
    fi

    if "$CONVERT" -dispose background -delay "$DELAY" -loop 0 "${sorted_files[@]}" \
        -layers coalesce -layers optimize "$gif_file" 2>/dev/null; then
        animated=$((animated + 1))
    else
        echo -e "  ${RED}ERROR${NC} ${group}: GIF failed"
        errors=$((errors + 1))
        return
    fi

    # For 2x: resize each frame first, then assemble
    tmpdir=$(mktemp -d)
    resized_frames=()
    idx=0
    for sf in "${sorted_files[@]}"; do
        tmp2x="${tmpdir}/frame_$(printf '%04d' $idx).png"
        "$CONVERT" "$sf" -filter point -resize 200% "$tmp2x" 2>/dev/null && resized_frames+=("$tmp2x")
        idx=$((idx + 1))
    done

    if [ ${#resized_frames[@]} -eq ${#sorted_files[@]} ]; then
        if "$CONVERT" -dispose background -delay "$DELAY" -loop 0 "${resized_frames[@]}" \
            -layers coalesce -layers optimize "$gif2x" 2>/dev/null; then
            :
        else
            echo -e "  ${RED}ERROR${NC} ${group}: @2x GIF failed"
            errors=$((errors + 1))
        fi
    fi
    rm -rf "$tmpdir"
}

while IFS='|' read -r cat bname; do
    # Compute group key: remove last '-' segment
    rev_name=$(echo "$bname" | rev)
    last_dash=$(echo "$rev_name" | awk '{print index($0,"-")}')
    total=${#bname}
    split=$((total - last_dash))

    if [ "$split" -le 0 ] || [ "$split" -ge "$total" ]; then
        # No dash found, single-frame sprite
        continue
    fi

    group="${bname:0:$split}"
    frame="${bname:$((split + 1))}"

    # Check if we've moved to a new group
    if [ "$group" != "$prev_group" ] || [ "$cat" != "$prev_cat" ]; then
        # Flush previous group
        if [ ${#frame_files[@]} -gt 0 ]; then
            flush_gif "$prev_cat" "$prev_group" "${frame_files[@]}"
        fi
        prev_group="$group"
        prev_cat="$cat"
        frame_files=()
    fi

    frame_files+=("${EXPORT_DIR}/${cat}/${bname}.png")

done < "$tmpfile"

# Flush last group
if [ ${#frame_files[@]} -gt 0 ]; then
    flush_gif "$prev_cat" "$prev_group" "${frame_files[@]}"
fi

echo -e "  ${GREEN}Created${NC} ${animated} animated GIF pairs (1x + 2x)"

# ── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "=== Done ==="
echo "  PNGs (1x):  ${converted}"
echo "  PNGs (2x):  ${upscaled}"
echo "  GIFs:       ${animated} pairs"
echo "  Errors:     ${errors}"
echo "  Output:     ${EXPORT_DIR}/{category}/"
