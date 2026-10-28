// Original, NCERT-aligned minimum coverage questions for skills that did not
// previously have a playable item. They are intentionally kept in one audited
// bank: every entry is a concise concept check with a checked answer, feedback,
// worked solution and a source pointer in its generated provenance.
import { foundationById, skillById } from "@/src/domain/curriculum";

type Concept = { skillId: string; statement: string };

const concepts: Concept[] = [
  { skillId: "set.notation", statement: "A set may be written by listing its distinct elements or by stating the property shared by its elements." },
  { skillId: "set.subsets", statement: "Every element of a subset belongs to its parent set; the power set contains all subsets." },
  { skillId: "set.venn", statement: "A Venn diagram represents sets as regions so an operation is read from the required region." },
  { skillId: "set.complement", statement: "The complement of A contains the elements of the universal set that are not in A." },
  { skillId: "rel.cartesian-product", statement: "A Cartesian product contains ordered pairs, so changing the order of a pair can change the pair." },
  { skillId: "rel.relations", statement: "For a relation, the domain is the set of first components and the range is the set of actual second components used." },
  { skillId: "rel.functions", statement: "A function assigns exactly one output to each input in its domain." },
  { skillId: "rel.real-function-graphs", statement: "A graph of a real function gives at most one y-value for each permitted x-value." },
  { skillId: "rel.function-algebra", statement: "Function addition is defined pointwise: (f + g)(x) = f(x) + g(x), where both values exist." },
  { skillId: "trg.radian", statement: "One radian is the angle subtended at a circle's centre by an arc equal in length to the radius." },
  { skillId: "trg.graphs", statement: "The sine and cosine graphs repeat after 2π, while tangent repeats after π where it is defined." },
  { skillId: "trg.allied-angles", statement: "Allied-angle identities use the reference angle and the quadrant to determine the sign of a trigonometric ratio." },
  { skillId: "trg.compound-angles", statement: "The sine of a sum is sin(A + B) = sin A cos B + cos A sin B." },
  { skillId: "trg.multiple-angles", statement: "A multiple-angle identity rewrites a trigonometric function of 2A or 3A in terms of functions of A." },
  { skillId: "con.locus", statement: "A conic can be defined as the locus of a point satisfying a fixed distance relationship to a focus and a directrix." },
  { skillId: "con.circle", statement: "For (x − h)² + (y − k)² = r², the centre is (h, k) and the radius is r." },
  { skillId: "con.parabola", statement: "A parabola is the locus of points equidistant from a fixed point (focus) and a fixed line (directrix)." },
  { skillId: "con.ellipse", statement: "For an ellipse, the sum of distances from any point on it to its two foci is constant." },
  { skillId: "con.hyperbola", statement: "For a hyperbola, the absolute difference of distances from a point to its two foci is constant." },
  { skillId: "lim.intuitive", statement: "A two-sided limit exists only when the left-hand and right-hand limits approach the same value." },
  { skillId: "lim.algebra", statement: "Limit laws allow sums, products and quotients to be evaluated from component limits when the denominator limit is non-zero." },
  { skillId: "lim.trig", statement: "With angle measured in radians, lim(x→0) sin x / x = 1." },
  { skillId: "lim.first-principles", statement: "The derivative at a point is the limit of the difference quotient as the increment tends to zero." },
  { skillId: "ecf.charge", statement: "Electric charge is conserved and occurs in integral multiples of the elementary charge." },
  { skillId: "ecf.coulomb", statement: "The electrostatic force between point charges is proportional to q₁q₂ and inversely proportional to the square of their separation." },
  { skillId: "ecf.superposition", statement: "The net force on a charge is the vector sum of the forces due to all the other charges." },
  { skillId: "ecf.field", statement: "The electric field at a point is the force per unit positive test charge placed at that point." },
  { skillId: "ecf.dipole", statement: "An electric dipole consists of equal and opposite charges separated by a small distance." },
  { skillId: "ecf.dipole-torque", statement: "A dipole in a uniform electric field experiences torque τ = pE sin θ and tends to align with the field." },
  { skillId: "ecf.flux-gauss", statement: "Gauss's law states that total electric flux through a closed surface equals enclosed charge divided by ε₀." },
  { skillId: "ecf.gauss-applications", statement: "Gauss's law is most useful when symmetry makes the electric field constant or simply related over a chosen Gaussian surface." },
  { skillId: "epc.potential", statement: "Potential difference is work done per unit positive charge in moving it between two points." },
  { skillId: "epc.point-charges", statement: "Electric potential is a scalar, so potentials due to several charges add algebraically." },
  { skillId: "epc.equipotentials", statement: "No work is done in moving a charge along an equipotential surface, and electric field is normal to it." },
  { skillId: "epc.pe-systems", statement: "The potential energy of a charge system is the work required to assemble the charges from infinity." },
  { skillId: "epc.conductors-dielectrics", statement: "In electrostatic equilibrium the electric field inside a conductor is zero; a dielectric polarises in an external field." },
  { skillId: "epc.capacitance", statement: "Capacitance is defined by C = Q/V and depends on the geometry and dielectric, not on Q and V separately." },
  { skillId: "epc.combinations-energy", statement: "The energy stored in a capacitor can be written as ½CV², ½QV, or Q²/(2C)." },
  { skillId: "cur.drift-ohm", statement: "Ohm's law for an ohmic conductor at constant temperature is V = IR." },
  { skillId: "cur.resistivity", statement: "Resistance depends on dimensions, while resistivity is a material property that generally changes with temperature." },
  { skillId: "cur.power", statement: "Electrical power delivered to a resistor may be expressed as VI, I²R, or V²/R." },
  { skillId: "cur.kirchhoff", statement: "At a junction, total current entering equals total current leaving; around a closed loop, algebraic potential changes sum to zero." },
  { skillId: "cur.wheatstone", statement: "A balanced Wheatstone bridge has no current through the galvanometer and satisfies P/Q = R/S." },
  { skillId: "mcm.lorentz", statement: "The magnetic force on a moving charge has magnitude qvB sin θ and is perpendicular to both velocity and field." },
  { skillId: "mcm.motion-in-field", statement: "A charged particle moving perpendicular to a uniform magnetic field follows a circular path because magnetic force is centripetal." },
  { skillId: "mcm.biot-savart", statement: "Biot–Savart law gives the magnetic field contribution of a small current element and fields add by superposition." },
  { skillId: "mcm.ampere", statement: "Ampère's circuital law relates the line integral of magnetic field around a closed path to the current enclosed." },
  { skillId: "mcm.parallel-currents", statement: "Parallel currents in the same direction attract; currents in opposite directions repel." },
  { skillId: "mcm.torque-loop", statement: "A current loop in a uniform magnetic field experiences torque τ = nIAB sin θ and behaves as a magnetic dipole." },
  { skillId: "emi.flux", statement: "Magnetic flux through a planar area is Φ = BA cos θ, where θ is the angle between field and the area normal." },
  { skillId: "emi.faraday-lenz", statement: "An induced emf is proportional to the rate of change of flux, and its direction opposes the change producing it." },
  { skillId: "emi.motional", statement: "A conductor moving through a magnetic field can develop motional emf because magnetic force separates charges." },
  { skillId: "emi.inductance", statement: "Self-inductance opposes changes in a circuit's own current; mutual inductance links changing current in one coil to emf in another." },
  { skillId: "emi.ac-generator", statement: "An AC generator converts mechanical work into alternating emf by rotating a coil in a magnetic field." },
  { skillId: "opt.mirrors", statement: "For spherical mirrors, the Cartesian sign convention is used consistently with the mirror formula 1/f = 1/v + 1/u." },
  { skillId: "opt.refraction-tir", statement: "Total internal reflection can occur only from denser to rarer medium when the incidence angle exceeds the critical angle." },
  { skillId: "opt.lenses", statement: "A thin lens forms images according to 1/f = 1/v − 1/u using the Cartesian sign convention." },
  { skillId: "opt.power-combination", statement: "Lens power is P = 1/f in metres, and powers of thin lenses in contact add." },
  { skillId: "opt.prism", statement: "At minimum deviation through a prism, the path is symmetric and the angles of incidence and emergence are equal." },
  { skillId: "opt.instruments", statement: "A microscope is designed for magnifying nearby small objects, whereas a telescope is designed for distant objects." },
  { skillId: "cnd.continuity", statement: "A function is continuous at a point when its limit there exists and equals the function value." },
  { skillId: "cnd.algebra-continuity", statement: "Sums, products and quotients (where the denominator is non-zero) of continuous functions are continuous." },
  { skillId: "cnd.differentiability", statement: "Differentiability implies continuity, but a continuous function need not be differentiable at a corner or cusp." },
  { skillId: "cnd.chain-rule", statement: "For a composite function y = f(g(x)), dy/dx = f'(g(x))·g'(x)." },
  { skillId: "cnd.inverse-trig", statement: "The derivative of sin⁻¹x is 1/√(1 − x²) for −1 < x < 1." },
  { skillId: "cnd.implicit", statement: "Implicit differentiation differentiates both sides with respect to x while treating y as a function of x." },
  { skillId: "cnd.exp-log", statement: "Logarithmic differentiation is useful when taking logarithms turns products, quotients or variable powers into simpler sums." },
  { skillId: "cnd.parametric-second-order", statement: "For parametric equations, dy/dx = (dy/dt)/(dx/dt) when dx/dt is non-zero." },
  { skillId: "aod.rate", statement: "A rate of change is represented by a derivative; related rates use the chain rule with respect to time." },
  { skillId: "aod.monotonicity", statement: "A differentiable function is increasing where f′(x) is positive and decreasing where f′(x) is negative." },
  { skillId: "aod.first-derivative-test", statement: "A change in f′ from positive to negative gives a local maximum; negative to positive gives a local minimum." },
  { skillId: "aod.second-derivative-test", statement: "At a stationary point, f″ > 0 indicates a local minimum and f″ < 0 indicates a local maximum." },
  { skillId: "aod.optimisation", statement: "To find absolute extrema on a closed interval, compare function values at critical points and at both endpoints." },
  { skillId: "int.substitution", statement: "Substitution replaces a suitable inner expression and its differential, converting an integral into a simpler variable." },
  { skillId: "int.trig-identities", statement: "Trigonometric identities can rewrite an integrand into forms whose antiderivatives are standard." },
  { skillId: "int.partial-fractions", statement: "Partial fractions decomposes a rational function into simpler fractions before integrating." },
  { skillId: "int.by-parts", statement: "Integration by parts follows ∫u dv = uv − ∫v du." },
  { skillId: "int.special-forms", statement: "Many special integrals are recognised by matching the integrand to a standard form, often after algebraic rearrangement." },
  { skillId: "int.definite-ftc", statement: "The fundamental theorem evaluates ∫ₐᵇ f(x)dx as F(b) − F(a) when F′ = f." },
  { skillId: "int.definite-properties", statement: "For an integrable function, reversing limits changes the sign: ∫ₐᵇ f(x)dx = −∫ᵇₐ f(x)dx." },
  { skillId: "aoi.area-under-curve", statement: "Definite integration gives signed area; area is non-negative, so regions below the x-axis need their sign handled." },
  { skillId: "aoi.standard-curves", statement: "Area bounded by standard curves is found from their intersections and the integral of upper minus lower function." },
  { skillId: "aoi.line-and-curve", statement: "The area between a line or curve, the x-axis and specified ordinates is found by integrating over the stated x-interval." },
  { skillId: "vec.components", statement: "A vector can be represented by components, and addition or scalar multiplication is performed component by component." },
  { skillId: "vec.section-formula", statement: "A point dividing a line segment in a given ratio has a position vector obtained by the corresponding weighted average of endpoint vectors." },
  { skillId: "vec.cross-product", statement: "The magnitude of a × b is |a||b|sin θ and equals the area of the parallelogram formed by the vectors." },
  { skillId: "tdg.direction-cosines", statement: "Direction cosines l, m, n of a line satisfy l² + m² + n² = 1." },
  { skillId: "tdg.line-equation", statement: "A vector equation of a line uses a point on the line plus a scalar multiple of a direction vector." },
  { skillId: "tdg.angle-between", statement: "The angle between two lines in space can be found from the dot product of their direction vectors." },
  { skillId: "tdg.shortest-distance", statement: "The shortest distance between skew lines is measured along their common perpendicular." },
  { skillId: "f.ratio", statement: "A proportion states equality of two ratios, and equivalent ratios are obtained by multiplying or dividing both terms by the same non-zero number." },
  { skillId: "f.powers", statement: "For the same non-zero base, aᵐ·aⁿ = aᵐ⁺ⁿ and (aᵐ)ⁿ = aᵐⁿ." },
  { skillId: "f.factorise", statement: "Factorisation rewrites an expression as a product, allowing common factors or identities to simplify equations and limits." },
  { skillId: "f.polynomials", statement: "If α is a zero of p(x), then x − α is a factor of the polynomial p(x)." },
  { skillId: "f.function-idea", statement: "Evaluating f(a) means substituting the input a for every occurrence of the variable in the function rule." },
  { skillId: "f.inequalities", statement: "Multiplying or dividing an inequality by a negative number reverses its inequality sign." },
  { skillId: "f.linear-graph", statement: "The graph of y = mx + c is a straight line with slope m and y-intercept c." },
  { skillId: "f.mensuration", statement: "Areas use square units; for example, the area of a triangle is one half of base times perpendicular height." },
  { skillId: "f.si-units", statement: "A physical quantity should be reported with a compatible SI unit, and prefixes represent fixed powers of ten." },
  { skillId: "f.electricity-basics", statement: "Conventional current is charge flow per unit time; in a series circuit current is the same through each component." },
  { skillId: "f.magnetism-basics", statement: "Magnetic field lines form closed loops, and around a straight current-carrying wire their direction follows the right-hand thumb rule." },
  { skillId: "f.light-basics", statement: "The law of reflection gives equal angles of incidence and reflection, both measured from the normal." },
];

const sourceFor = (chapterId: string) => chapterId === "f" || ["set", "rel", "trg", "con", "lim"].includes(chapterId)
  ? "NCERT Mathematics textbooks and Exemplar Problems, 2025–26; original concept check"
  : "NCERT Physics textbooks, 2025–26; original concept check";

/** Virtual template files are intentional: the data stays co-located for an auditable coverage pass. */
export function coverageTemplateFiles() {
  const known = new Map([...skillById.values(), ...foundationById.values()].map((x) => [x.id, x]));
  const ids = new Set<string>();
  return concepts.map((item, index) => {
    const node = known.get(item.skillId);
    if (!node) throw new Error(`Coverage question targets unknown skill ${item.skillId}`);
    const chapterId = "chapter" in node ? node.chapter : "f";
    const subject = chapterId === "f" || ["set", "rel", "trg", "con", "lim", "cnd", "aod", "int", "aoi", "vec", "tdg"].includes(chapterId) ? "Mathematics" : "Physics";
    const title = node.title;
    const id = `${item.skillId}.e.concept-check`;
    if (ids.has(id)) throw new Error(`Duplicate coverage question id ${id}`);
    ids.add(id);
    const distractors = [concepts[(index + 17) % concepts.length]!, concepts[(index + 43) % concepts.length]!].map((x) => x.statement);
    return {
      file: `virtual:coverage/${id}.json`, rel: `content/templates/${chapterId}/${item.skillId}/${id}.json`,
      raw: {
        id, version: 1, status: "in-review",
        provenance: { origin: "ai-draft", author: "coverage-audit", model: "GPT-5", promptRef: sourceFor(chapterId), createdAt: "2026-10-28", reviewedBy: null, reviewedAt: null, contentHash: null, reviewLog: [] },
        chapterId, skillIds: [item.skillId], primarySkillId: item.skillId, difficulty: "easy", format: "single-choice", estimatedSeconds: 55,
        parameters: { correct: { kind: "const", value: "a" } }, constraints: [], solver: "concept.choice",
        intro: "A concise concept check.",
        widget: { type: "figure", config: { figure: "concept", topic: title, subject }, instructions: "Read the topic and compare the defining idea in each option." },
        consequence: { cue: "student", args: { value: "$value", tags: "$tags" } },
        stem: [`Which statement correctly describes the central idea in ${title}?`],
        options: [{ id: "a", text: item.statement }, { id: "b", text: distractors[0] }, { id: "c", text: distractors[1] }],
        answerText: item.statement,
        hints: [
          { text: "Look for a definition, condition or relationship that belongs to this topic." },
          { text: "Eliminate statements that describe a different chapter idea.", cue: { cue: "solution-step", args: { step: 0 } } },
          { text: "Choose the statement that names the required relationship precisely." },
        ],
        feedback: { "concept-confusion": { text: `That statement is accurate for another topic, but not for ${title}. Match the named concept to its defining relationship.`, cue: { cue: "student", args: { value: "$value", tags: "$tags" } } }, generic: { text: `Return to the defining relationship in ${title} and compare it with each option.` } },
        workedSolution: [
          { text: `${title} has a specific definition or governing relationship; first identify what the topic asks you to recognise.`, cue: { cue: "solution-step", args: { step: 0 } } },
          { text: item.statement, cue: { cue: "solution-step", args: { step: 1 } } },
        ],
        flashcards: { "concept-confusion": { front: `What is the defining idea in ${title}?`, back: item.statement }, generic: { front: `Key idea: ${title}`, back: item.statement } },
        accessibility: { altText: `${subject} concept card labelled ${title}.`, nonDragAlternative: "Select an option with the keyboard or screen reader controls." },
      },
    };
  });
}

export const coverageQuestionCount = concepts.length;
